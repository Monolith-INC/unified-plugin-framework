/** A user-visible direction and its destination in the discovery route. */
export interface DiscoveryDirection { readonly label: string; readonly target: string }
/** One stage and the directions available from it. */
export interface DiscoveryNode { readonly id: string; readonly directions: readonly DiscoveryDirection[] }
/** The discovery route; it describes choices and does not own persisted state. */
export interface DiscoveryStoryboard { readonly entry: string; readonly nodes: readonly DiscoveryNode[] }
export type StoryboardIssue =
  | { readonly kind: "missing-entry"; readonly id: string }
  | { readonly kind: "duplicate-node"; readonly id: string }
  | { readonly kind: "unknown-target"; readonly id: string; readonly target: string }
  | { readonly kind: "unreachable"; readonly id: string };
export type StoryboardValidation = { readonly ok: true } | { readonly ok: false; readonly issues: readonly StoryboardIssue[] };
export type DiscoveryStep = { readonly kind: "ready"; readonly node: DiscoveryNode }
  | { readonly kind: "invalid-state"; readonly value: unknown; readonly recovery: readonly ["restart", "pause"] };

const node = (id: string, directions: readonly (readonly [string, string])[]): DiscoveryNode => Object.freeze({
  id, directions: Object.freeze(directions.map(([label, target]) => Object.freeze({ label, target }))),
});

/** Discovery follows the installed brainstorming flow; deeper modes add layers to its conversation. */
export const DISCOVERY_STORYBOARD: DiscoveryStoryboard = Object.freeze({
  entry: "context",
  nodes: Object.freeze([
    node("context", [["Discuss the request", "conversation"], ["Proceed with a clear request", "execute"]]),
    node("conversation", [["Explore a decision", "elicitation"], ["Play back understanding", "playback"], ["Size the work", "sizing"]]),
    node("elicitation", [["Review the result", "after-elicitation"]]),
    node("after-elicitation", [["Continue the conversation", "conversation"], ["Play back understanding", "playback"]]),
    node("playback", [["Continue the conversation", "conversation"], ["Size the work", "sizing"]]),
    node("sizing", [["Proceed with a small change", "execute"], ["Write a design", "design"]]),
    node("design", [["Review the design", "review"]]),
    node("review", [["Revise the design", "design"], ["Finish discovery", "complete"]]),
    node("execute", []),
    node("complete", []),
  ]),
});

const reachable = (nodes: readonly DiscoveryNode[], pending: readonly string[], visited: readonly string[]): readonly string[] => {
  const [next, ...rest] = pending;
  return next === undefined ? visited : visited.includes(next) ? reachable(nodes, rest, visited)
    : reachable(nodes, [...rest, ...(nodes.find((item) => item.id === next)?.directions.map((item) => item.target) ?? [])], [...visited, next]);
};

/** Validate references and reachability without changing the route. */
export const validateDiscoveryStoryboard = (storyboard: DiscoveryStoryboard): StoryboardValidation => {
  const ids = storyboard.nodes.map((item) => item.id);
  const seen = reachable(storyboard.nodes, [storyboard.entry], []);
  const issues: readonly StoryboardIssue[] = [
    ...(ids.includes(storyboard.entry) ? [] : [{ kind: "missing-entry" as const, id: storyboard.entry }]),
    ...ids.flatMap((id, index) => ids.indexOf(id) === index ? [] : [{ kind: "duplicate-node" as const, id }]),
    ...storyboard.nodes.flatMap((item) => item.directions.filter((direction) => !ids.includes(direction.target))
      .map((direction) => ({ kind: "unknown-target" as const, id: item.id, target: direction.target }))),
    ...ids.filter((id) => !seen.includes(id)).map((id) => ({ kind: "unreachable" as const, id })),
  ];
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
};

/** Missing state starts discovery; an unrecognized state offers recovery without changing it. */
export const resolveDiscoveryStep = (saved: unknown): DiscoveryStep => {
  const id = saved === undefined ? DISCOVERY_STORYBOARD.entry : saved;
  const found = typeof id === "string" ? DISCOVERY_STORYBOARD.nodes.find((item) => item.id === id) : undefined;
  return found === undefined ? { kind: "invalid-state", value: id, recovery: ["restart", "pause"] } : { kind: "ready", node: found };
};
