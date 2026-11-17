import { randomUUID } from "node:crypto";
import { open, readFile, rename, unlink, mkdir, lstat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { applyLocal, parseLocal } from "./local.js";
import { artifactPage, linearCall, linearReply, verifyLinearScope, type ToolCall } from "./linear.js";
import { fail, flatMap, isWrite, object, ok, parseJson, publication, type Artifact, type Request, type Result, type Task, type TrackerReply } from "./model.js";
import { SETTINGS_FILE, parseSettings, type TrackerSettings } from "./settings.js";
import type { ProjectIO } from "./service.js";

const codeOf = (error: unknown): unknown => object(error) ? error.code : undefined;
const diskFailure = (): Result<never> => fail("storage-error", "Project files could not be read or saved.", "Check the project directory's access and preserve existing files before resuming.");
const busy = (): Result<never> => fail("project-busy", "Another process is updating these project records.", "Wait for that operation to finish. If it was interrupted, confirm it stopped before removing its .lock file.");

/** Filesystem boundary: a missing file is absence; unreadable/corrupt files stay failures. */
const readJson = (path: string): Task<unknown> => () => readFile(path, "utf8").then(parseJson)
  .catch((error: unknown) => codeOf(error) === "ENOENT" ? ok(null) : diskFailure());

const noSymlink = (path: string): Promise<boolean> => lstat(path).then((stat) => !stat.isSymbolicLink())
  .catch((error: unknown) => codeOf(error) === "ENOENT");
const safeDirectory = (path: string): Promise<boolean> => noSymlink(path).then((safe) => safe
  ? mkdir(path, { recursive: true }).then(() => true) : false);

// Resource boundary: exclusive locks prevent two writers losing one another's changes.
const locked = <A>(path: string, action: Task<A>): Task<A> => () => open(`${path}.lock`, "wx").then((lock) => action()
  .finally(() => lock.close().then(() => unlink(`${path}.lock`))))
  .catch((error: unknown) => codeOf(error) === "EEXIST" ? busy() : diskFailure());

// Atomic publication boundary; failed writes never replace the previous readable record.
const writeJson = (path: string, value: unknown): Task<null> => () => noSymlink(path).then((safe) => safe
  ? atomicWrite(path, value) : Promise.resolve(diskFailure()));

/** Setup shares the same guarded JSON and concurrent-update boundary as project operations. */
export const nodeProjectFiles = Object.freeze({
  read: readJson,
  write: (path: string, value: unknown, previous: unknown): Task<null> => () => locked(path, () => readJson(path)().then((read) =>
    flatMap(read, (current) => JSON.stringify(current) === JSON.stringify(previous)
      ? ok(current) : fail("settings-changed", "Configuration changed during setup.", "Reload and preserve the new configuration before resuming.")))
    .then((checked) => checked.ok ? writeJson(path, value)() : checked))(),
});
const atomicWrite = (path: string, value: unknown): Promise<Result<null>> => {
  const temporary = `${path}.${randomUUID()}.tmp`;
  return open(temporary, "wx", 0o600).then((file) => file.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8")
    .finally(() => file.close())).then(() => rename(temporary, path)).then(() => ok(null))
    .catch(() => unlink(temporary).catch(() => undefined).then(diskFailure));
};

const localTransaction = (path: string, request: Request): Task<TrackerReply> => () => readJson(path)().then((raw) => {
  const changed = flatMap(raw, (value) => flatMap(parseLocal(value), (items) => applyLocal(items, request, randomUUID())));
  switch (changed.ok) {
    case false: return changed;
    case true: return changed.value.changed ? writeJson(path, changed.value.items)().then((saved) => flatMap(saved, () => ok(changed.value.reply))) : ok(changed.value.reply);
  }
});
const localRequest = (repo: string, request: Request): Task<TrackerReply> => () => {
  const directory = join(repo, ".unified-plugin-framework");
  const path = join(directory, "items.json");
  return isWrite(request) ? safeDirectory(directory).then((safe) => safe ? locked(path, localTransaction(path, request))() : diskFailure()).catch(diskFailure)
    : localTransaction(path, request)();
};

const connectorContent = (reply: unknown): Result<unknown> => {
  switch (true) {
    case !object(reply): return fail("invalid-reply", "The tracker connector returned an unreadable response.", "Check the connector and read the current work item before retrying writes.");
    default: return replyContent(reply as Readonly<Record<string, unknown>>);
  }
};
const replyContent = (reply: Readonly<Record<string, unknown>>): Result<unknown> => {
  switch (true) {
    case reply.isError === true: return fail("tracker-error", "The tracker connector reported an operation failure.", "Inspect the tracker connection and current item; preserve the original request and do not replay an uncertain write.");
    case object(reply.structuredContent): return ok(reply.structuredContent);
    default: return parseJson(Array.isArray(reply.content) ? reply.content.filter((part) => object(part) && part.type === "text").map((part) => part.text).join("\n") : "");
  }
};

const connectionFailure = (request: Request): Result<never> => isWrite(request)
  ? fail("outcome-unknown", "The tracker connection ended before this write's outcome was confirmed.", "Read or search for the item in the selected project before retrying. Do not repeat the write automatically.")
  : fail("connection-unavailable", "The tracker connection is unavailable.", "Restore the configured connection or credential, then repeat the read; setup choices are already saved.");

// Connector boundary: one request, no write retries; the SDK owns transport and resource cleanup.
const invoke = (client: Client, planned: ToolCall, request: Request): Task<unknown> => () => client.callTool(planned, undefined, { timeout: 30_000 })
  .then(connectorContent).catch(() => connectionFailure(request));

const perform = (client: Client, settings: TrackerSettings, planned: ToolCall, request: Request): Task<TrackerReply> => () =>
  invoke(client, planned, request)().then((result) => flatMap(result, (value) => linearReply(settings, request, value)));

const allArtifacts = (client: Client, ref: string, cursor: string | null = null, seen: readonly string[] = []): Task<readonly Artifact[]> => () =>
  invoke(client, { name: "list_comments", arguments: { issueId: ref, limit: 100, ...(cursor === null ? {} : { cursor }) } }, { operation: "list_artifacts", ref })().then((raw) => {
    const listed = flatMap(raw, artifactPage);
    switch (listed.ok) {
      case false: return listed;
      case true: return listed.value.hasMore && listed.value.cursor !== null
        ? nextArtifactPage(client, ref, listed.value.items, listed.value.cursor, seen)
        : ok(listed.value.items);
    }
  });
const nextArtifactPage = (client: Client, ref: string, items: readonly Artifact[], cursor: string, seen: readonly string[]): Promise<Result<readonly Artifact[]>> =>
  seen.includes(cursor) ? Promise.resolve(fail("invalid-pagination", "The connector repeated an artifact cursor.", "Restore pagination before publishing a revision."))
    : allArtifacts(client, ref, cursor, seen.concat(cursor))().then((rest) => flatMap(rest, (found) => ok(items.concat(found))));
const publishRemote = (client: Client, settings: TrackerSettings, planned: ToolCall, request: Extract<Request, { readonly operation: "publish_artifact" }>): Task<TrackerReply> => () =>
  allArtifacts(client, request.ref)().then((listed) => {
    switch (listed.ok) {
      case false: return listed;
      case true: return alreadyPublished(client, settings, planned, request, listed.value);
    }
  });
const alreadyPublished = (client: Client, settings: TrackerSettings, planned: ToolCall, request: Extract<Request, { readonly operation: "publish_artifact" }>, listed: readonly Artifact[]): Promise<Result<TrackerReply>> => {
  const decision = publication(listed, request.artifact);
  switch (decision.ok) {
    case false: return Promise.resolve(decision);
    case true: return decision.value.status === "existing" ? Promise.resolve(ok(request.artifact)) : perform(client, settings, planned, request)();
  }
};
const inProject = (client: Client, settings: TrackerSettings, planned: ToolCall, request: Request): Task<TrackerReply> => () => {
  switch (true) {
    case !("ref" in request): return perform(client, settings, planned, request)();
    default: return scopedCall(client, settings, planned, request as Request & { readonly ref: string });
  }
};
const scopedItem = (client: Client, settings: TrackerSettings, ref: string): Task<unknown> => () =>
  invoke(client, { name: "get_issue", arguments: { id: ref } }, { operation: "get_work_item", ref })().then((raw) =>
    flatMap(raw, (value) => verifyLinearScope(settings, object(value) && object(value.issue) ? value.issue : value)));
const scopedCall = (client: Client, settings: TrackerSettings, planned: ToolCall, request: Request & { readonly ref: string }): Promise<Result<TrackerReply>> =>
  scopedItem(client, settings, request.ref)().then((scoped) => {
    switch (scoped.ok) {
      case false: return scoped;
      case true: return request.operation === "get_work_item" ? linearReply(settings, request, scoped.value)
        : request.operation === "publish_artifact" ? publishRemote(client, settings, planned, request)() : perform(client, settings, planned, request)();
    }
  });
const parentOf = (request: Request): string => {
  switch (request.operation) {
    case "create_work_item": return request.parent ?? "";
    case "update_work_item": return request.changes.parent ?? "";
    default: return "";
  }
};
const parentScope = (client: Client, settings: TrackerSettings, request: Request): Task<null> => () => {
  const parent = parentOf(request);
  switch (true) {
    case parent === "": return Promise.resolve(ok(null));
    case "ref" in request && parent === request.ref: return Promise.resolve(fail("invalid-parent", "An item cannot be its own parent.", "Select a different parent from this project."));
    default: return scopedItem(client, settings, parent)().then((scoped) => flatMap(scoped, () => ok(null)));
  }
};

/** Shared authentication, transport and resource boundary for operations and setup reads. */
const withLinearConnector = <A>(settings: TrackerSettings, use: (client: Client) => Task<A>): Task<A> => () => {
  const tokenEnv = settings.connection?.tokenEnv ?? "LINEAR_API_KEY";
  const token = process.env[tokenEnv]; // fp-allow: no-ambient-effect -- credential boundary; never persisted or logged
  return token === undefined || token === "" ? Promise.resolve(fail("authentication-needed", "The configured tracker credential is not available.",
    `Set ${tokenEnv} in the connector environment and rerun setup; never put credentials in a plan or chat.`)) : connected(settings, token, use);
};
const connected = <A>(settings: TrackerSettings, token: string, use: (client: Client) => Task<A>): Promise<Result<A>> => {
  const client = new Client({ name: "unified-plugin-framework", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(settings.connection?.url ?? "https://mcp.linear.app/mcp"),
    { requestInit: { headers: { Authorization: `Bearer ${token}` } } });
  return client.connect(transport).then(() => use(client)())
    .catch(() => fail("connection-unavailable", "The tracker connection could not be opened.", "Restore the configured connection or credential, then resume; existing choices are preserved."))
    .finally(() => client.close().catch(() => undefined));
};

export interface LinearScopeNames { readonly team: string; readonly project: string }
export interface LinearScope { readonly team: string; readonly project: string }
const scopeId = (value: unknown): string | null => object(value) && typeof (value.uuid ?? value.id) === "string"
  && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(String(value.uuid ?? value.id)) ? String(value.uuid ?? value.id) : null;
const scopeOf = (team: unknown, project: unknown): Result<LinearScope> => {
  const teamId = scopeId(team);
  const projectId = scopeId(project);
  const teams = object(project) && Array.isArray(project.teams) ? project.teams : [];
  return teamId !== null && projectId !== null && teams.some((entry: unknown) => scopeId(entry) === teamId)
    ? ok({ team: teamId, project: projectId }) : fail("invalid-scope", "The connector did not establish the selected project's membership in the selected team.",
      "Choose an unambiguous team/project name or URL and repeat setup; no project settings were saved.");
};
/** Resolve user-facing names using the existing connector, without asking users to type UUIDs. */
export const resolveLinearScopeWithConnector = (client: Client, names: LinearScopeNames): Task<LinearScope> => () =>
  invoke(client, { name: "get_team", arguments: { query: names.team } }, { operation: "search_work_items", query: "" })()
    .then((team) => !team.ok ? team : invoke(client, { name: "get_project", arguments: { query: names.project } }, { operation: "search_work_items", query: "" })()
      .then((project) => flatMap(project, (value) => scopeOf(team.value, value))));
/** Setup uses the same authentication and transport as Linear work-item operations. */
export const resolveLinearScope = (names: LinearScopeNames, settings: TrackerSettings = { adapter: "linear", values: {} }): Task<LinearScope> =>
  withLinearConnector(settings, (client) => resolveLinearScopeWithConnector(client, names));

/** Readiness proves a scoped read, without requiring domain labels on unrelated existing issues. */
export const probeLinearWithConnector = (client: Client, settings: TrackerSettings): Task<string> => () => {
  const request = { operation: "search_work_items", query: "" } as const;
  const planned = linearCall(settings, request);
  return !planned.ok ? Promise.resolve(planned) : invoke(client, planned.value, request)().then((raw) =>
    flatMap(raw, (value) => object(value) && Array.isArray(value.issues) ? ok("Selected tracker completed a scoped read without creating a test item.")
      : fail("invalid-reply", "The tracker returned no readable listing.", "Restore the configured connector and retry verification.")));
};
/** Adapter verification has its own outcome; normal work-item reads retain their strict domain decoding. */
export const probeProjectRead = (project: string): Task<string> => () => nodeProjectIO(project).readSettings()
  .then((raw) => flatMap(raw, parseSettings)).then((settings) => {
    switch (settings.ok) {
      case false: return settings;
      case true: return settings.value.tracker.adapter === "linear"
        ? withLinearConnector(settings.value.tracker, (client) => probeLinearWithConnector(client, settings.value.tracker))()
        : nodeProjectIO(project).local({ operation: "search_work_items", query: "" })().then((result) =>
          flatMap(result, () => ok("Selected adapter completed a read in the configured project without creating a test item.")));
    }
  });

/** The production connector path is also usable by an embedded host with an existing MCP client. */
export const requestWithConnector = (client: Client, settings: TrackerSettings, request: Request): Task<TrackerReply> => () => {
  const planned = linearCall(settings, request);
  switch (planned.ok) {
    case false: return Promise.resolve(planned);
    case true: return parentScope(client, settings, request)().then((parent) => {
      switch (parent.ok) {
        case false: return parent;
        case true: return inProject(client, settings, planned.value, request)();
      }
    });
  }
};
const remoteRequest = (settings: TrackerSettings, request: Request): Task<TrackerReply> =>
  withLinearConnector(settings, (client) => requestWithConnector(client, settings, request));

/** Node effects for the target project; all business decisions remain in the shared service. */
export const nodeProjectIO = (project: string): ProjectIO => {
  const repo = resolve(project);
  const settings = join(repo, SETTINGS_FILE);
  return {
    readSettings: readJson(settings),
    saveSettings: (value, previous) => locked(settings, () => readJson(settings)().then((read) => {
      switch (read.ok) {
        case false: return read;
        case true: return JSON.stringify(read.value) === JSON.stringify(previous) ? writeJson(settings, value)()
          : fail("settings-changed", "Project choices changed while setup was being completed.", "Reload the saved choices, preserve those changes and apply the missing answers again.");
      }
    })),
    local: (request) => localRequest(repo, request),
    remote: remoteRequest,
  };
};
