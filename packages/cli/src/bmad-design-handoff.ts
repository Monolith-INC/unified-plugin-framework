import { randomUUID } from "node:crypto";
import { link, lstat, readFile, rm, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { sha256 } from "@agent-plugins/compiler";
import { fail, object, ok, parseJson, type Result } from "@agent-plugins/project";
import { directory, readText, safePath, writeText } from "./tooling-files.js";
import type { CliIo } from "./index.js";

type Provider = "product-design" | "bmad";
type Choice = { readonly digest: string; readonly extension: string };
type Options = { readonly provider: Provider; readonly choices: readonly Choice[] };
type Decisions = { readonly design: string; readonly experience: string };
type Handoff = Options & (
  | { readonly status: "awaiting-choice" }
  | { readonly status: "selected"; readonly number: number }
  | { readonly status: "writing" | "finished"; readonly number: number; readonly decisions: Decisions }
);
type Stored = { readonly state: Handoff; readonly raw: string };

const STORAGE = ".upf-design-handoff";
const STATE = `${STORAGE}/state.json`;
const DESIGN_AFTER_LAYOUT = ["Elevation & Depth", "Shapes", "Components", "Do's and Don'ts"];
const BEGIN = "<!-- upf-design-handoff:start -->";
const END = "<!-- upf-design-handoff:end -->";
const EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg", ".html", ".excalidraw"]);
const problem = (message: string): Result<never> =>
  fail("invalid-request", message, "Keep the BMAD workspace and restore the original mockup or retry the same handoff.");
const provider = (value: unknown): value is Provider => value === "product-design" || value === "bmad";
const nonblank = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";
const decisionText = (value: unknown): value is string => nonblank(value) && !value.includes(BEGIN) && !value.includes(END);
const decisions = (value: unknown): value is Decisions => object(value) && decisionText(value.design) && decisionText(value.experience);
const choice = (value: unknown): value is Choice => object(value) && typeof value.digest === "string" && /^[0-9a-f]{64}$/.test(value.digest)
  && typeof value.extension === "string" && EXTENSIONS.has(value.extension);
const validNumber = (number: unknown, count: number): number is number =>
  typeof number === "number" && Number.isInteger(number) && number > 0 && number <= count;
const state = (value: unknown): value is Handoff => object(value) && provider(value.provider) && Array.isArray(value.choices)
  && value.choices.length > 0 && value.choices.every(choice) && (value.status === "awaiting-choice"
    || validNumber(value.number, value.choices.length) && (value.status === "selected"
      || (value.status === "writing" || value.status === "finished") && decisions(value.decisions)));

const workingPath = (option: Choice, number: number): string => `${STORAGE}/design-option-${number}-${option.digest}${option.extension}`;
const importPath = (option: Choice): string => `imports/design-choice-${option.digest}${option.extension}`;
const key = (state: Options): string => JSON.stringify({ provider: state.provider, choices: state.choices });
const missing = (error: unknown): boolean => object(error) && error.code === "ENOENT";

const checkPath = async (workspace: string, path: string): Promise<string> => {
  const absolute = join(workspace, path);
  // Reject unsafe filesystem paths at the command boundary.
  if (!await safePath(workspace, absolute)) throw new Error(`Unsafe workspace path: ${path}.`);
  return absolute;
};

const readJson = async (path: string): Promise<unknown> => {
  const result = parseJson(await readFile(path, "utf8"));
  if (!result.ok) throw new Error("The handoff input is not valid JSON.");
  return result.value;
};

const load = async (workspace: string): Promise<Result<Stored | null>> => {
  const current = await readText(await checkPath(workspace, STATE));
  if (!current.ok) return current;
  if (current.value === null) return ok(null);
  const parsed = parseJson(current.value);
  return parsed.ok && state(parsed.value) ? ok({ state: parsed.value, raw: current.value }) : problem("The saved handoff cannot be read.");
};

const save = (workspace: string, state: Handoff, previous: Stored | null, python: string): Promise<Result<string>> =>
  writeText(workspace, join(workspace, STATE), JSON.stringify(state, null, 2) + "\n", previous?.raw ?? null, python);

const summary = (state: Handoff): object => ({
  provider: state.provider,
  status: state.status,
  options: state.choices.map((option, index) => ({ number: index + 1, path: workingPath(option, index + 1) })),
  ...(state.status === "awaiting-choice" ? {} : { selection: state.number, path: importPath(state.choices[state.number - 1] as Choice) }),
});

const readSource = async (path: string) => {
  const extension = extname(path).toLowerCase();
  if (!EXTENSIONS.has(extension) || !(await lstat(path)).isFile()) throw new Error("Use a regular image, HTML or Excalidraw mockup file.");
  const bytes = await readFile(path);
  if (bytes.length === 0) throw new Error("A mockup file is empty.");
  return { option: { extension, digest: sha256(bytes) }, bytes };
};

/** Publish complete bytes without replacing a file another process may already be using. */
const publish = async (workspace: string, path: string, bytes: Buffer): Promise<void> => {
  const target = await checkPath(workspace, path);
  const previous = await readFile(target).catch((error: unknown) => missing(error) ? null : Promise.reject(error));
  if (previous?.equals(bytes)) return;
  if (previous !== null) throw new Error(`Saved mockup changed: ${path}.`);
  const staging = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(staging, bytes, { flag: "wx" });
    await link(staging, target).catch(async (error: unknown) => {
      if (!(object(error) && error.code === "EEXIST" && (await readFile(await checkPath(workspace, path))).equals(bytes))) throw error;
    });
  } finally {
    await rm(staging, { force: true });
  }
};

const record = async (workspace: string, input: unknown, previous: Stored | null, python: string): Promise<Result<object>> => {
  if (!object(input) || !provider(input.provider) || !Array.isArray(input.paths) || input.paths.length === 0 || !input.paths.every(nonblank)) {
    return problem("Supply a provider and mockup paths in display order.");
  }
  const documents = await Promise.all(["DESIGN.md", "EXPERIENCE.md"].map(async (file) =>
    lstat(await checkPath(workspace, file)).then((entry) => entry.isFile(), (error: unknown) => missing(error) ? false : Promise.reject(error))));
  if (!documents.every(Boolean)) return problem("Use a BMAD workspace with both design documents.");
  const files = await Promise.all(input.paths.map((path) => readSource(resolve(workspace, path))));
  const next: Handoff = { status: "awaiting-choice", provider: input.provider, choices: files.map(({ option }) => option) };
  if (previous !== null && key(previous.state) !== key(next)) return problem("This workspace already has a different saved set of mockups.");
  const working = await directory(workspace, join(workspace, STORAGE));
  if (!working.ok) return working;
  await Promise.all(files.map(({ option, bytes }, index) => publish(workspace, workingPath(option, index + 1), bytes)));
  const saved = previous === null ? await save(workspace, next, null, python) : ok(STATE);
  return saved.ok ? ok(summary(previous?.state ?? next)) : saved;
};

const verifiedMock = async (workspace: string, path: string, option: Choice): Promise<Buffer> => {
  const absolute = await checkPath(workspace, path);
  if (!(await lstat(absolute)).isFile()) throw new Error(`Saved mockup is not a regular file: ${path}.`);
  const bytes = await readFile(absolute);
  if (sha256(bytes) !== option.digest) throw new Error(`Saved mockup changed: ${path}.`);
  return bytes;
};

const select = async (workspace: string, stored: Stored, number: number, python: string): Promise<Result<object>> => {
  const { state } = stored;
  const option = state.choices[number - 1];
  if (option === undefined || (state.status !== "awaiting-choice" && state.number !== number)) {
    return problem("Choose a displayed option, or retry the option already chosen.");
  }
  const bytes = await verifiedMock(workspace, workingPath(option, number), option);
  const imports = await directory(workspace, join(workspace, "imports"));
  if (!imports.ok) return imports;
  const next: Handoff = state.status === "awaiting-choice" ? { ...state, status: "selected", number } : state;
  const saved = state.status === "awaiting-choice" ? await save(workspace, next, stored, python) : ok(STATE);
  if (!saved.ok) return saved;
  await publish(workspace, importPath(option), bytes);
  return ok(summary(next));
};

type Heading = { readonly index: number; readonly level: number; readonly title: string };
type Outline = { readonly fence: string; readonly headings: readonly Heading[] };
const scanHeading = ({ fence, headings }: Outline, line: string, index: number): Outline => {
  const delimiter = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  switch (true) {
    case fence !== "" && delimiter !== null && (delimiter[1] ?? "").startsWith(fence) && (delimiter[2] ?? "").trim() === "":
      return { fence: "", headings };
    case fence !== "": return { fence, headings };
    case delimiter !== null: return { fence: delimiter?.[1] ?? "", headings };
    default: {
      const heading = /^ {0,3}(#{1,2})[ \t]+(.+?)\s*#*\s*$/.exec(line);
      return heading === null ? { fence, headings } : {
        fence, headings: [...headings, { index, level: (heading[1] ?? "").length, title: heading[2] ?? "" }],
      };
    }
  }
};

const appendDecision = (source: string, heading: string, path: string, notes: string): Result<string> => {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const block = [BEGIN, notes.trim().replace(/\r?\n/g, newline), "", `[Selected mockup](${path})`, END].join(newline);
  if (source.includes(block)) return ok(source);
  if (source.includes(BEGIN) || source.includes(END)) return problem("The handoff notes already in this document differ from the saved decisions.");
  const lines = source.split(/\r?\n/);
  const frontmatterEnd = lines[0] === "---" ? lines.indexOf("---", 1) : -1;
  const { headings, fence } = lines.reduce<Outline>((outline, line, index) =>
    index <= frontmatterEnd ? outline : scanHeading(outline, line, index), { fence: "", headings: [] });
  if (fence !== "") return problem("Close the unfinished Markdown code fence before inserting handoff notes.");
  const section = headings.find(({ level, title }) => level === 2 && title === heading);
  const next = section === undefined
    ? headings.find(({ level, title }) => level === 2 && heading === "Layout & Spacing" && DESIGN_AFTER_LAYOUT.includes(title))
    : headings.find(({ index }) => index > section.index);
  const end = next?.index ?? lines.length;
  const addition = section === undefined ? [`## ${heading}`, "", block] : [block];
  return ok([lines.slice(0, end).join(newline).trimEnd(), "", ...addition, "", ...lines.slice(end)].join(newline));
};

const document = async (workspace: string, file: string, heading: string, path: string, notes: string) => {
  const absolute = await checkPath(workspace, file);
  const current = await readText(absolute);
  if (!current.ok || current.value === null) return problem(`Open the BMAD workspace containing ${file} before finishing.`);
  const next = appendDecision(current.value, heading, path, notes);
  return next.ok ? ok({ absolute, before: current.value, after: next.value }) : next;
};

const finish = async (workspace: string, stored: Stored, supplied: unknown, python: string): Promise<Result<object>> => {
  const { state } = stored;
  const input = supplied ?? (state.status === "writing" || state.status === "finished" ? state.decisions : null);
  if (state.status === "awaiting-choice" || !decisions(input)) return problem("Select a mockup and supply visual and experience decisions first.");
  if (state.status !== "selected" && (state.decisions.design !== input.design || state.decisions.experience !== input.experience)) {
    return problem("Resume with the decisions already saved for this selection.");
  }
  const option = state.choices[state.number - 1] as Choice;
  const path = importPath(option);
  await verifiedMock(workspace, path, option);
  const design = await document(workspace, "DESIGN.md", "Layout & Spacing", path, input.design);
  const experience = await document(workspace, "EXPERIENCE.md", "Key Flows", path, input.experience);
  if (!design.ok) return design;
  if (!experience.ok) return experience;
  const writing: Handoff = { ...state, status: "writing", decisions: { design: input.design, experience: input.experience } };
  const journal = state.status === "selected" ? await save(workspace, writing, stored, python) : ok(STATE);
  if (!journal.ok) return journal;
  const results = await Promise.all([design.value, experience.value].map(({ absolute, before, after }) =>
    before === after ? ok(absolute) : writeText(workspace, absolute, after, before, python, true)));
  const failed = results.find((result) => !result.ok);
  if (failed !== undefined) return failed;
  const next: Handoff = { ...writing, status: "finished" };
  const saved = state.status === "finished" ? ok(STATE) : await save(workspace, next,
    state.status === "writing" ? stored : { state: writing, raw: JSON.stringify(writing, null, 2) + "\n" }, python);
  return saved.ok ? ok(summary(next)) : saved;
};

const run = async (cwd: string, python: string, [operation, target, input]: readonly string[]): Promise<Result<object>> => {
  if (operation === "provider" && (target === "ready" || target === "unavailable")) {
    return ok({ provider: target === "ready" ? "product-design" : "bmad" });
  }
  if (target === undefined) return problem("Use provider ready|unavailable, or record|inspect|select|finish with a BMAD workspace.");
  const workspace = resolve(cwd, target);
  const current = await load(workspace);
  if (!current.ok) return current;
  if (operation === "inspect") return ok(current.value === null ? { status: "empty" } : summary(current.value.state));
  if (operation === "record" && input !== undefined) return record(workspace, await readJson(resolve(cwd, input)), current.value, python);
  if (current.value === null) return problem("Record mockup options in this workspace first.");
  switch (operation) {
    case "select": return select(workspace, current.value, /^\d+$/.test(input ?? "") ? Number(input) : Number.NaN, python);
    case "finish": return finish(workspace, current.value, input === undefined ? null : await readJson(resolve(cwd, input)), python);
    default: return problem("Unknown handoff operation.");
  }
};

export const runBmadDesignHandoff = async (args: readonly string[], io: CliIo): Promise<number> => {
  const [flag, executable, ...rest] = args;
  const result = await (flag === "--python"
    ? nonblank(executable) ? run(io.cwd(), executable, rest) : Promise.resolve(problem("Supply a Python executable."))
    : run(io.cwd(), "python3", args)).catch((error: unknown) =>
    problem(error instanceof Error ? error.message : String(error)));
  if (!result.ok) {
    io.err(JSON.stringify(result.error));
    return 1;
  }
  io.out(JSON.stringify(result.value));
  return 0;
};
