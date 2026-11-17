/** Expected failures carry the action that makes the request resumable. */
export interface Failure {
  readonly code: string;
  readonly message: string;
  readonly recovery: string;
}

export type Result<A> = { readonly ok: true; readonly value: A } | { readonly ok: false; readonly error: Failure };
export type Task<A> = () => Promise<Result<A>>;
export type JsonObject = Readonly<Record<string, unknown>>;

export const ok = <A>(value: A): Result<A> => ({ ok: true, value });
export const fail = (code: string, message: string, recovery: string): Result<never> => ({ ok: false, error: { code, message, recovery } });
export const flatMap = <A, B>(result: Result<A>, next: (value: A) => Result<B>): Result<B> => {
  switch (result.ok) {
    case true: return next(result.value);
    case false: return result;
  }
};
export const object = (value: unknown): value is JsonObject => typeof value === "object" && value !== null && !Array.isArray(value);
export const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
export const parseJson = (raw: string): Result<unknown> => {
  // External JSON boundary: malformed data is an expected failure.
  try { return ok(JSON.parse(raw)); }
  catch { return fail("invalid-json", "The supplied JSON could not be read.", "Correct the JSON and repeat the request."); }
};

export const KINDS = ["epic", "feature", "user_story", "task", "bug"] as const;
export type Kind = (typeof KINDS)[number];
export const STATES = ["backlog", "ready", "in_progress", "done", "canceled"] as const;
export type State = (typeof STATES)[number];

export interface WorkItem {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly kind: Kind;
  readonly state: State;
  readonly parent: string;
  readonly url: string;
}

export interface Artifact {
  readonly kind: string;
  readonly title: string;
  readonly content: string;
  readonly revision: string;
}

export interface Page<A> { readonly items: readonly A[]; readonly hasMore: boolean; readonly cursor: string | null }
export type TrackerReply = WorkItem | Artifact | Page<WorkItem> | Page<Artifact>;
export interface OperationReplies {
  readonly get_work_item: WorkItem;
  readonly search_work_items: Page<WorkItem>;
  readonly create_work_item: WorkItem;
  readonly update_work_item: WorkItem;
  readonly transition_work_item: WorkItem;
  readonly list_children: Page<WorkItem>;
  readonly list_artifacts: Page<Artifact>;
  readonly publish_artifact: Artifact;
}
export const page = <A>(items: readonly A[]): Page<A> => ({ items, hasMore: false, cursor: null });

export type Request =
  | { readonly operation: "get_work_item" | "list_children" | "list_artifacts"; readonly ref: string; readonly cursor?: string }
  | { readonly operation: "search_work_items"; readonly query: string; readonly cursor?: string }
  | { readonly operation: "create_work_item"; readonly kind: Kind; readonly title: string; readonly description: string; readonly parent?: string }
  | { readonly operation: "update_work_item"; readonly ref: string; readonly changes: Readonly<Partial<Pick<WorkItem, "title" | "description" | "parent">>> }
  | { readonly operation: "transition_work_item"; readonly ref: string; readonly state: State }
  | { readonly operation: "publish_artifact"; readonly ref: string; readonly artifact: Artifact };

export const isKind = (value: unknown): value is Kind => KINDS.some((kind) => kind === value);
export const isState = (value: unknown): value is State => STATES.some((state) => state === value);
export const isArtifact = (value: unknown): value is Artifact => object(value) && [value.kind, value.title, value.content, value.revision].every(text);
export type Publication = { readonly status: "existing" | "new"; readonly artifact: Artifact };
/** One revision cannot silently change; both storage adapters share these semantics. */
export const publication = (artifacts: readonly Artifact[], artifact: Artifact): Result<Publication> => {
  const existing = artifacts.find((entry) => entry.kind === artifact.kind && entry.revision === artifact.revision);
  switch (true) {
    case existing === undefined: return ok({ status: "new", artifact });
    case existing?.title === artifact.title && existing?.content === artifact.content: return ok({ status: "existing", artifact });
    default: return fail("artifact-conflict", "That artifact revision already exists with different content.", "Read the existing artifact and publish a new revision.");
  }
};
const changesValid = (value: unknown): boolean => object(value) && Object.keys(value).length > 0
  && Object.entries(value).every(([key, entry]) => ["title", "description", "parent"].includes(key) && typeof entry === "string")
  && (value.title === undefined || text(value.title));

const requestValid = (value: JsonObject): boolean => {
  switch (value.operation) {
    case "get_work_item": case "list_children": case "list_artifacts": return text(value.ref);
    case "search_work_items": return typeof value.query === "string";
    case "create_work_item": return isKind(value.kind) && text(value.title) && typeof value.description === "string" && (value.parent === undefined || text(value.parent));
    case "update_work_item": return text(value.ref) && changesValid(value.changes);
    case "transition_work_item": return text(value.ref) && isState(value.state);
    case "publish_artifact": return text(value.ref) && isArtifact(value.artifact);
    default: return false;
  }
};

/** Parse once at the boundary; downstream operations consume the typed request. */
export const parseRequest = (value: unknown): Result<Request> => object(value) && requestValid(value) && (value.cursor === undefined || text(value.cursor))
  ? ok(value as unknown as Request)
  : fail("invalid-request", "The operation or its arguments are invalid.", "Use project-operations for the operation inputs and correct the request.");

export const isWrite = ({ operation }: Request): boolean =>
  ["create_work_item", "update_work_item", "transition_work_item", "publish_artifact"].includes(operation);

/** Right-hand fields win; plain object patches form a monoid under shallow override. */
export const objectPatches = Object.freeze({
  empty: Object.freeze({}) as JsonObject,
  concat: (left: JsonObject, right: JsonObject): JsonObject => ({ ...left, ...right }),
});
