import { fail, flatMap, isKind, isState, object, ok, page, parseJson, text, type Artifact, type JsonObject, type Page, type Request, type Result, type TrackerReply, type WorkItem } from "./model.js";
import type { TrackerSettings } from "./settings.js";

export interface ToolCall { readonly name: string; readonly arguments: JsonObject }
export const LINEAR_KINDS = Object.freeze({ epic: "Epic", feature: "Feature", user_story: "Story", task: "Task", bug: "Bug" });
export const LINEAR_STATES = Object.freeze({ backlog: "Backlog", ready: "Todo", in_progress: "In Progress", done: "Done", canceled: "Canceled" });
const call = (name: string, args: JsonObject): Result<ToolCall> => ok({ name, arguments: args });
const unsupported = (operation: string): Result<never> => fail("unsupported-operation", `${operation} is not supported by this adapter yet.`, "Keep the draft and use an adapter that supports this operation; project setup is already complete.");

const scopeNames = (value: JsonObject, field: string): readonly unknown[] => {
  const nested = value[field];
  return [value[`${field}Id`], ...(object(nested) ? [nested.id, nested.name, nested.key] : [nested])];
};
/** Ref-based operations must stay inside the project selected at bootstrap. */
export const verifyLinearScope = (settings: TrackerSettings, value: unknown): Result<unknown> => object(value)
  && ["team", "project"].every((field) => scopeNames(value, field).includes(settings.values[field])) ? ok(value)
  : fail("outside-project", "The item does not establish membership in the configured project and team.", "Use an item from the selected project, or correct the project's adapter settings; no write was made.");

/** Provider names and fields live in this adapter, never in workflow instructions. */
export const linearCall = (settings: TrackerSettings, request: Request): Result<ToolCall> => {
  const scope = { team: settings.values.team, project: settings.values.project };
  switch (request.operation) {
    case "get_work_item": return call("get_issue", { id: request.ref });
    case "search_work_items": return call("list_issues", { ...scope, query: request.query, limit: 100, ...(request.cursor === undefined ? {} : { cursor: request.cursor }) });
    case "list_children": return call("list_issues", { ...scope, parentId: request.ref, limit: 100, ...(request.cursor === undefined ? {} : { cursor: request.cursor }) });
    case "create_work_item": return call("save_issue", { ...scope, title: request.title, description: request.description,
      labels: [settings.values[`kind.${request.kind}`] ?? LINEAR_KINDS[request.kind]],
      ...(request.parent === undefined ? {} : { parentId: request.parent }) });
    case "update_work_item": return call("save_issue", { id: request.ref,
      ...(request.changes.title === undefined ? {} : { title: request.changes.title }),
      ...(request.changes.description === undefined ? {} : { description: request.changes.description }),
      ...(request.changes.parent === undefined ? {} : { parentId: request.changes.parent === "" ? null : request.changes.parent }) });
    case "transition_work_item": return call("save_issue", { id: request.ref, state: settings.values[`state.${request.state}`] ?? LINEAR_STATES[request.state] });
    case "list_artifacts": return call("list_comments", { issueId: request.ref, limit: 100, ...(request.cursor === undefined ? {} : { cursor: request.cursor }) });
    case "publish_artifact": return call("save_comment", { issueId: request.ref, body: artifactText(request.artifact) });
  }
};

const PREFIX = "<!-- upf-artifact ";
export const artifactText = (artifact: Artifact): string => `${PREFIX}${JSON.stringify({ kind: artifact.kind, title: artifact.title, revision: artifact.revision })} -->\n${artifact.content}`;
const artifactFrom = (entry: unknown): readonly Artifact[] => {
  const body = object(entry) && typeof entry.body === "string" ? entry.body : "";
  const end = body.indexOf(" -->\n");
  return body.startsWith(PREFIX) && end > PREFIX.length ? artifactMetadata(body.slice(PREFIX.length, end), body.slice(end + 5)) : [];
};
const artifactMetadata = (raw: string, content: string): readonly Artifact[] => {
  const parsed = parseJson(raw);
  return parsed.ok && object(parsed.value) && [parsed.value.kind, parsed.value.title, parsed.value.revision].every(text)
    ? [{ kind: parsed.value.kind as string, title: parsed.value.title as string, revision: parsed.value.revision as string, content }] : [];
};

const kindOf = (settings: TrackerSettings, value: JsonObject): Result<WorkItem["kind"]> => {
  const labels = Array.isArray(value.labels) ? value.labels : [];
  const names = labels.map((label) => typeof label === "string" ? label : object(label) ? label.name : "");
  const matches = Object.entries(LINEAR_KINDS).filter(([kind, label]) => names.includes(settings.values[`kind.${kind}`] ?? label)).map(([kind]) => kind);
  return matches.length === 1 && isKind(matches[0]) ? ok(matches[0]) : fail("unmapped-kind", "The work item's kind is missing or ambiguous.", "Configure the project's kind label mapping and ensure the item has exactly one kind label.");
};
const stateOf = (settings: TrackerSettings, value: unknown): Result<WorkItem["state"]> => {
  const name = object(value) ? value.name : value;
  const matched = Object.entries(LINEAR_STATES).find(([state, label]) => (settings.values[`state.${state}`] ?? label) === name)?.[0];
  return isState(matched) ? ok(matched) : fail("unmapped-state", "The item's state has no project mapping.", "Set the matching state mapping in project setup and resume.");
};
const item = (settings: TrackerSettings, value: unknown): Result<WorkItem> => object(value) && text(value.id) && text(value.title)
  ? flatMap(kindOf(settings, value), (kind) => flatMap(stateOf(settings, value.status ?? value.state), (state) => ok({
    id: typeof value.identifier === "string" ? value.identifier : value.id as string, title: value.title as string,
    description: typeof value.description === "string" ? value.description : "", kind, state,
    parent: typeof value.parentId === "string" ? value.parentId : "", url: typeof value.url === "string" ? value.url : "",
  }))) : fail("invalid-reply", "The tracker returned an unreadable work item.", "Read the item's current state before retrying a write.");

const items = (settings: TrackerSettings, entries: readonly unknown[]): Result<readonly WorkItem[]> =>
  entries.reduce<Result<readonly WorkItem[]>>((result, entry) => flatMap(result, (all) => flatMap(item(settings, entry), (next) => ok([...all, next]))), ok([]));

const paged = <A>(entries: readonly A[], value: JsonObject): Result<Page<A>> => value.hasNextPage !== true ? ok(page(entries))
  : text(value.cursor) ? ok({ items: entries, hasMore: true, cursor: value.cursor })
    : fail("invalid-pagination", "The connector omitted the next cursor for an incomplete listing.", "Restore a connector that returns pagination cursors before treating the listing as complete.");

/** Artifact pages keep their cursor so publication can inspect every existing revision. */
export const artifactPage = (value: unknown): Result<Page<Artifact>> => Array.isArray(value) ? ok(page(value.flatMap(artifactFrom)))
  : object(value) && Array.isArray(value.comments) ? paged(value.comments.flatMap(artifactFrom), value)
    : unsupported("listing artifacts from this connector reply");

/** Decode connector output into the neutral model, preserving pagination diagnostics. */
export const linearReply = (settings: TrackerSettings, request: Request, value: unknown): Result<TrackerReply> => {
  switch (request.operation) {
    case "search_work_items": case "list_children": return object(value) && Array.isArray(value.issues)
      ? flatMap(items(settings, value.issues), (found) => paged(found, value))
      : fail("invalid-reply", "The tracker returned an unreadable work-item listing.", "Check the connector version and resume the read.");
    case "list_artifacts": return artifactPage(value);
    case "publish_artifact": return ok(request.artifact);
    default: return item(settings, object(value) && object(value.issue) ? value.issue : value);
  }
};
