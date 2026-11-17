import { access, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { fail, ok, type Result } from "@agent-plugins/project";
import { checkoutDir, sourceRoot, verifySource, type DependencySource, type SourceFetcher } from "./dependency-sources.js";
import type { PluginFactsIo } from "./plugin-facts.js";
import { command } from "./tooling-process.js";
import { directory, setupFailure } from "./tooling-files.js";

/** Where the fetch writes and checks: the project boundary, the cache, and the framework whose lock decides. */
export type FetchContext = {
  readonly project: string;
  readonly cache: string;
  readonly framework: string;
  readonly workflows: readonly string[];
  readonly io: PluginFactsIo;
  readonly fetcher: SourceFetcher;
};

const fetchFailure = (source: DependencySource): Result<never> => fail("dependency-fetch",
  `Could not fetch ${source.plugin} at ${source.ref} from ${source.repository}.`,
  "Nothing was staged. Check git, network access and repository permissions, then rerun bootstrap; or give its root in pluginRoots.");

const GIT_STEPS = (source: DependencySource): readonly (readonly string[])[] => [
  ["init", "-q"],
  ["fetch", "-q", "--depth", "1", source.repository, source.ref],
  ["checkout", "-q", "--detach", "FETCH_HEAD"],
];
const gitSteps = (steps: readonly (readonly string[])[], into: string): Promise<Result<string>> => {
  const [step, ...rest] = steps;
  return step === undefined ? Promise.resolve(ok(into))
    : command("git", step, into, 300_000).then((result) => result.ok ? gitSteps(rest, into) : result);
};

/** Production fetcher: a shallow git checkout of exactly the pinned ref, without its history. */
export const GIT_FETCHER: SourceFetcher = {
  fetch: (source, into) => gitSteps(GIT_STEPS(source), into)
    .then((result) => result.ok ? rm(join(into, ".git"), { recursive: true, force: true }).then(() => result) : fetchFailure(source)),
};

const exists = (path: string): Promise<boolean> => access(path).then(() => true, () => false);

/** Sources whose verified checkout is not cached yet. */
export const unfetched = (cache: string, sources: readonly DependencySource[]): Promise<readonly DependencySource[]> =>
  Promise.all(sources.map((source) => exists(checkoutDir(cache, source)))).then((present) => sources.filter((_, index) => !present[index]));

/** Fetch into a private directory, verify against the lock, and only then publish it as the cached checkout. */
const fetchOne = async (context: FetchContext, source: DependencySource): Promise<Result<string>> => {
  const target = checkoutDir(context.cache, source);
  const staged = join(context.cache, `.fetch-${randomUUID()}`);
  const created = await directory(context.project, staged);
  const fetched = created.ok ? await context.fetcher.fetch(source, staged) : created;
  const verified = fetched.ok ? verifySource(context.io, context.framework, context.workflows, source, sourceRoot(staged, source)) : fetched;
  return verified.ok
    ? rename(staged, target).then(() => ok(target), () => discard(staged, setupFailure(`Could not cache ${source.plugin}; rerun bootstrap.`)))
    : discard(staged, verified);
};
const discard = (path: string, result: Result<never>): Promise<Result<never>> =>
  rm(path, { recursive: true, force: true }).then(() => result, () => result);

/** Fetches each missing source in turn; the first failure stops the run and leaves earlier verified checkouts cached. */
export const fetchSources = (context: FetchContext, sources: readonly DependencySource[]): Promise<Result<string>> =>
  unfetched(context.cache, sources).then((missing) => fetchNext(context, missing));
const fetchNext = (context: FetchContext, sources: readonly DependencySource[]): Promise<Result<string>> => {
  const [source, ...rest] = sources;
  return source === undefined ? Promise.resolve(ok("Pinned dependency sources fetched and verified."))
    : fetchOne(context, source).then((result) => result.ok ? fetchNext(context, rest) : result);
};
