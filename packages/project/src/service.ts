import { flatMap, ok, type Request, type Result, type Task, type TrackerReply } from "./model.js";
import { configure, parseSettings, setupPrompt, type Settings, type TrackerSettings } from "./settings.js";

/** Effects supplied once at the application edge. */
export interface ProjectIO {
  readonly readSettings: Task<unknown>;
  readonly saveSettings: (settings: Settings, previous: unknown) => Task<null>;
  readonly local: (request: Request) => Task<TrackerReply>;
  readonly remote: (settings: TrackerSettings, request: Request) => Task<TrackerReply>;
}

export type ProjectReply =
  | { readonly status: "setup-needed"; readonly setup: ReturnType<typeof setupPrompt>; readonly request: Request | null }
  | { readonly status: "completed"; readonly language: string; readonly artifactsPath: string; readonly value: Settings | TrackerReply };

const route = (io: ProjectIO, settings: Settings, request: Request): Task<TrackerReply> => {
  switch (settings.tracker.adapter) {
    case "local": return io.local(request);
    case "linear": return io.remote(settings.tracker, request);
  }
};
const execute = (io: ProjectIO, settings: Settings, request: Request): Task<ProjectReply> => () => route(io, settings, request)()
  .then((result) => flatMap(result, (value) => ok(completed(settings, value))));
const completed = (settings: Settings, value: Settings | TrackerReply): ProjectReply => ({ status: "completed", language: settings.language, artifactsPath: settings.artifactsPath, value });

const configured = (io: ProjectIO, raw: unknown, request: Request | null): Task<ProjectReply> => () => {
  const settings = parseSettings(raw);
  switch (settings.ok) {
    case false: return Promise.resolve(settings.error.code === "setup-needed"
      ? ok({ status: "setup-needed", setup: setupPrompt(raw), request } as const) : settings);
    case true: return request === null
      ? Promise.resolve(ok(completed(settings.value, settings.value)))
      : execute(io, settings.value, request)();
  }
};

/** No preflight routine: resolve the project for this request, or return the bootstrap handoff. */
export const operate = (io: ProjectIO, request: Request | null): Task<ProjectReply> => () => io.readSettings().then((read) => {
  switch (read.ok) {
    case false: return read;
    case true: return configured(io, read.value, request)();
  }
});

const saveAndResume = (io: ProjectIO, settings: Settings, previous: unknown, request: Request | null): Task<ProjectReply> => () => io.saveSettings(settings, previous)().then((saved) => {
  switch (saved.ok) {
    case false: return saved;
    case true: return request === null ? Promise.resolve(ok(completed(settings, settings))) : execute(io, settings, request)();
  }
});

/** Apply accepted answers, preserving existing settings, then continue the suspended operation once. */
export const setup = (io: ProjectIO, answers: unknown, request: Request | null = null): Task<ProjectReply> => () => io.readSettings().then((read) => {
  const settings: Result<Settings> = flatMap(read, (existing) => configure(existing, answers));
  switch (settings.ok) {
    case false: return settings;
    case true: return saveAndResume(io, settings.value, read.ok ? read.value : null, request)();
  }
});
