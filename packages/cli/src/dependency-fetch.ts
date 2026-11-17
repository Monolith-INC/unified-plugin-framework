import { access, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { fail, ok, type Result } from "@agent-plugins/project";
import { checkoutDir, sourceRoot, type DependencySource, type SourceFetcher } from "./dependency-sources.js";
import { command, sequence } from "./tooling-process.js";
import { directory, setupFailure } from "./tooling-files.js";

/** Accepts a fetched plugin root, or says why its pin rejects it. */
export type VerifySource = (source: DependencySource, root: string) => Result<string>;

/** Where the fetch writes: the project boundary and the cache; `verify` is the lock's decision, injected. */
export type FetchContext = {
  readonly project: string;
  readonly cache: string;
  readonly verify: VerifySource;
  readonly fetcher: SourceFetcher;
};

const fetchFailure = (source: DependencySource): Result<never> => fail("dependency-fetch",
  `Could not fetch ${source.plugin} at ${source.ref} from ${source.repository}.`,
  "Nothing was staged. Check git, network access and repository permissions, then rerun bootstrap; or give its root in pluginRoots.");

const gitCommands = (source: DependencySource): readonly (readonly string[])[] => [
  ["init", "-q"],
  ["fetch", "-q", "--depth", "1", source.repository, source.ref],
  ["checkout", "-q", "--detach", "FETCH_HEAD"],
];
/** The caller's GIT_* variables could redirect git to another repository; prompts would hang until the timeout. */
const gitEnvironment = (): NodeJS.ProcessEnv => ({
  ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_"))), // fp-allow: no-ambient-effect
  GIT_TERMINAL_PROMPT: "0",
});

/** Production fetcher: a shallow git checkout of exactly the pinned ref, without its history. */
export const GIT_FETCHER: SourceFetcher = {
  fetch: (source, into) => sequence(gitCommands(source), (args) => command("git", args, into, 300_000, gitEnvironment()), into)
    .then((result): Promise<Result<string>> | Result<string> => result.ok ? rm(join(into, ".git"), { recursive: true, force: true }).then(() => result) : fetchFailure(source))
    .catch(() => fetchFailure(source)),
};

const exists = (path: string): Promise<boolean> => access(path).then(() => true, () => false);
const verifiedCheckout = (context: FetchContext, source: DependencySource): Promise<boolean> => {
  const checkout = checkoutDir(context.cache, source);
  return exists(checkout).then((present) => present && context.verify(source, sourceRoot(checkout, source)).ok);
};

/** Sources without a cached checkout that still matches its pin; an edited or re-pinned cache is fetched again. */
export const unfetched = (context: FetchContext, sources: readonly DependencySource[]): Promise<readonly DependencySource[]> =>
  Promise.all(sources.map((source) => verifiedCheckout(context, source))).then((cached) => sources.filter((_, index) => !cached[index]));

const discard = (path: string, result: Result<never>): Promise<Result<never>> =>
  rm(path, { recursive: true, force: true }).then(() => result, () => result);
/** Replaces a stale checkout only after the new one passed verification. */
const publish = (staged: string, target: string, source: DependencySource): Promise<Result<string>> =>
  rm(target, { recursive: true, force: true }).then(() => rename(staged, target)).then(() => ok(target),
    () => discard(staged, setupFailure(`Could not cache ${source.plugin}; rerun bootstrap.`)));

/** Fetch into a private directory, verify against the lock, and only then publish it as the cached checkout. */
const fetchOne = async (context: FetchContext, source: DependencySource): Promise<Result<string>> => {
  const staged = join(context.cache, `.fetch-${randomUUID()}`);
  const created = await directory(context.project, staged);
  const fetched = created.ok ? await context.fetcher.fetch(source, staged).catch(() => fetchFailure(source)) : created;
  const verified = fetched.ok ? context.verify(source, sourceRoot(staged, source)) : fetched;
  return verified.ok ? publish(staged, checkoutDir(context.cache, source), source) : discard(staged, verified);
};

/** Fetches each missing source in turn; the first failure stops the run and leaves earlier verified checkouts cached. */
export const fetchSources = (context: FetchContext, sources: readonly DependencySource[]): Promise<Result<string>> =>
  unfetched(context, sources).then((missing) => sequence(missing, (source) => fetchOne(context, source), "Pinned dependency sources fetched and verified."));
