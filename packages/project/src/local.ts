import { fail, flatMap, isArtifact, isKind, isState, object, ok, page, publication, type Artifact, type Request, type Result, type TrackerReply, type WorkItem } from "./model.js";

export interface LocalItem extends WorkItem { readonly artifacts: readonly Artifact[] }
export interface LocalChange {
  readonly items: readonly LocalItem[];
  readonly reply: TrackerReply;
  readonly changed: boolean;
}

const isItem = (value: unknown): value is LocalItem => object(value) && typeof value.id === "string"
  && typeof value.title === "string" && typeof value.description === "string" && isKind(value.kind) && isState(value.state)
  && typeof value.parent === "string" && typeof value.url === "string" && Array.isArray(value.artifacts) && value.artifacts.every(isArtifact);

export const parseLocal = (value: unknown): Result<readonly LocalItem[]> => value === null ? ok([])
  : Array.isArray(value) && value.every(isItem) ? ok(value)
  : fail("invalid-local-store", "The local work items could not be read.", "Restore the local store from a readable copy before resuming; existing records were preserved.");

const view = ({ id, title, description, kind, state, parent, url }: LocalItem): WorkItem => ({ id, title, description, kind, state, parent, url });
const read = (items: readonly LocalItem[], reply: TrackerReply): Result<LocalChange> => ok({ items, reply, changed: false });
const replace = (items: readonly LocalItem[], item: LocalItem): Result<LocalChange> =>
  ok({ items: items.map((entry) => entry.id === item.id ? item : entry), reply: view(item), changed: true });
const withItem = (items: readonly LocalItem[], ref: string, use: (item: LocalItem) => Result<LocalChange>): Result<LocalChange> => {
  const item = items.find(({ id }) => id === ref);
  return item === undefined ? fail("not-found", `Work item ${ref} was not found.`, "Search for the existing item and repeat the operation with its id.") : use(item);
};
const parentValid = (items: readonly LocalItem[], id: string, parent: string): boolean => parent === ""
  || parent !== id && items.some((item) => item.id === parent) && !ancestors(items, parent).includes(id);
const ancestors = (items: readonly LocalItem[], ref: string, visited: readonly string[] = []): readonly string[] => {
  const item = items.find(({ id }) => id === ref);
  return item === undefined || visited.includes(ref) ? visited : ancestors(items, item.parent, [...visited, ref]);
};
const badParent = (): Result<never> => fail("invalid-parent", "The parent is missing or would create a cycle.", "Select an existing parent outside this item's descendants.");
const newItem = (request: Extract<Request, { readonly operation: "create_work_item" }>, id: string): LocalItem => ({
  id, title: request.title, description: request.description, kind: request.kind, state: "backlog", parent: request.parent ?? "", url: "", artifacts: [],
});
const append = (items: readonly LocalItem[], item: LocalItem): Result<LocalChange> => ok({ items: items.concat(item), reply: view(item), changed: true });

const publish = (items: readonly LocalItem[], item: LocalItem, artifact: Artifact): Result<LocalChange> =>
  flatMap(publication(item.artifacts, artifact), (decision) => decision.status === "existing" ? read(items, artifact)
    : flatMap(replace(items, { ...item, artifacts: item.artifacts.concat(artifact) }), (change) => ok({ ...change, reply: artifact })));

/** One pure operation path; the storage boundary supplies the snapshot and a fresh id. */
export const applyLocal = (items: readonly LocalItem[], request: Request, freshId: string): Result<LocalChange> => {
  switch (request.operation) {
    case "get_work_item": return withItem(items, request.ref, (item) => read(items, view(item)));
    case "search_work_items": return read(items, page(items.filter((item) => `${item.title}\n${item.description}`.toLowerCase().includes(request.query.toLowerCase())).map(view)));
    case "list_children": return withItem(items, request.ref, () => read(items, page(items.filter(({ parent }) => parent === request.ref).map(view))));
    case "list_artifacts": return withItem(items, request.ref, ({ artifacts }) => read(items, page(artifacts)));
    case "create_work_item": return parentValid(items, freshId, request.parent ?? "")
      ? append(items, newItem(request, freshId))
      : badParent();
    case "update_work_item": return withItem(items, request.ref, (item) => parentValid(items, item.id, request.changes.parent ?? item.parent)
      ? replace(items, { ...item, ...request.changes }) : badParent());
    case "transition_work_item": return withItem(items, request.ref, (item) => replace(items, { ...item, state: request.state }));
    case "publish_artifact": return withItem(items, request.ref, (item) => publish(items, item, request.artifact));
  }
};
