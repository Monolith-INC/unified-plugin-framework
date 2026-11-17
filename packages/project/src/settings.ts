import { fail, flatMap, object, objectPatches, ok, text, type JsonObject, type Result } from "./model.js";

export const SETTINGS_FILE = ".unified-plugin-framework.json";

export interface Connection {
  readonly url: string;
  readonly tokenEnv: string;
}

export interface TrackerSettings {
  readonly adapter: "local" | "linear";
  readonly values: Readonly<Record<string, string>>;
  readonly connection?: Connection;
}

export interface Settings extends JsonObject {
  readonly schemaVersion: 1;
  readonly language: string;
  readonly artifactsPath: string;
  readonly tracker: TrackerSettings;
}

const LINEAR = Object.freeze({ label: "Linear", required: ["team", "project"], instruction: "Resolve the selected team and project through the connector and save their UUIDs; ask the user to select names, not type identifiers.", connection: { url: "https://mcp.linear.app/mcp", tokenEnv: "LINEAR_API_KEY" } });
export const TRACKERS = Object.freeze({ local: { label: "Local files", required: [] }, linear: LINEAR });

const languageValid = (value: unknown): value is string => text(value) && /^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$/.test(value);
const strings = (value: unknown): value is Readonly<Record<string, string>> => object(value) && Object.values(value).every((entry) => typeof entry === "string");
const httpsUrl = (value: unknown): boolean => {
  // External URL refinement: malformed accepted input must not crash a deferred operation.
  try { const url = new URL(String(value)); return url.protocol === "https:" && url.hostname !== "" && url.username === "" && url.password === ""; }
  catch { return false; }
};
const uuid = (value: unknown): boolean => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const connectionValid = (value: unknown): value is Connection => object(value) && httpsUrl(value.url)
  && text(value.tokenEnv) && /^[A-Za-z_][A-Za-z0-9_]*$/.test(value.tokenEnv);

const tracker = (value: unknown): Result<TrackerSettings> => {
  switch (true) {
    case !object(value): return fail("setup-needed", "Choose the project's tracker.", "Run project-bootstrap, then resume the request.");
    default: return trackerObject(value as JsonObject);
  }
};

const trackerObject = (value: JsonObject): Result<TrackerSettings> => {
  const values = strings(value.values) ? value.values : {};
  switch (value.adapter) {
    case "local": return ok({ ...value, adapter: "local", values });
    case "linear": return ["team", "project"].every((key) => uuid(values[key]))
      && (value.connection === undefined || connectionValid(value.connection))
      ? ok({ ...value, adapter: "linear", values, connection: value.connection ?? LINEAR.connection } as TrackerSettings)
      : fail("setup-needed", "The selected tracker needs its team/project identifiers and a valid connection.", "Run project-bootstrap; resolve the user's selected team and project through the connector and save their UUIDs.");
    default: return fail("setup-needed", "The selected tracker adapter is unavailable.", "Run project-bootstrap and choose an available adapter.");
  }
};

/** Preserve unrelated project keys while refining the settings used by the runtime. */
export const parseSettings = (value: unknown): Result<Settings> => {
  switch (true) {
    case !object(value): return fail("setup-needed", "Project setup has not been completed.", "Run project-bootstrap, then resume the original request.");
    default: return settingsObject(value as JsonObject);
  }
};

const settingsObject = (value: JsonObject): Result<Settings> => {
  switch (true) {
    case value.schemaVersion !== undefined && value.schemaVersion !== 1:
      return fail("unsupported-settings", "The project settings use an unsupported version.", "Use a framework version that supports this settings file; preserve the existing file.");
    case !languageValid(value.language) || !text(value.artifactsPath):
      return fail("setup-needed", "Choose the project language and planning document location.", "Run project-bootstrap to fill the missing choices.");
    default: return flatMap(tracker(value.tracker), (selected) => ok({ ...value, schemaVersion: 1, language: value.language as string, artifactsPath: value.artifactsPath as string, tracker: selected }));
  }
};

/** Bootstrap answers overlay the existing settings; this is a patch, not a replacement. */
export const configure = (existing: unknown, answers: unknown): Result<Settings> => object(answers)
  ? parseSettings(projectPatch(asObject(existing), answers))
  : fail("invalid-settings", "Setup answers must be an object.", "Collect the missing project choices and submit them as JSON.");

const asObject = (value: unknown): JsonObject => object(value) ? value : objectPatches.empty;
const trackerPatch = (existing: JsonObject, answers: JsonObject): JsonObject => objectPatches.concat(
  objectPatches.concat(existing, answers), objectPatches.concat(
    { values: objectPatches.concat(asObject(existing.values), asObject(answers.values)) },
    existing.connection === undefined && answers.connection === undefined ? {} : { connection: objectPatches.concat(asObject(existing.connection), asObject(answers.connection)) }));
const projectPatch = (existing: JsonObject, answers: JsonObject): JsonObject => objectPatches.concat(
  objectPatches.concat(existing, answers), { tracker: trackerPatch(asObject(existing.tracker), asObject(answers.tracker)) });

/** Available choices are data for bootstrap; workflow skills never select a provider. */
export const setupPrompt = (existing: unknown) => ({
  skill: "project-bootstrap",
  existing: object(existing) ? existing : {},
  choices: TRACKERS,
  answerShape: { language: "<project language tag>", artifactsPath: "<planning document location>", tracker: { adapter: "<selected adapter>", values: {} } },
  suggested: { language: "en", artifactsPath: "docs/work-items" },
  instruction: "Reuse saved choices; ask only for missing information. Save accepted choices with project setup, then resume the original request.",
});
