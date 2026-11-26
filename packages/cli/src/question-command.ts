import { nextDiscovery, normalizeQuestionAnswer, prepareQuestion, type DecisionContext, type DiscoveryEvent, type DiscoveryState, type Question, type QuestionCapabilities, type QuestionResponse, type QuestionWording } from "@agent-plugins/workflows";

type RecordValue = Readonly<Record<string, unknown>>;
const record = (value: unknown): value is RecordValue => typeof value === "object" && value !== null && !Array.isArray(value);
const strings = (value: unknown): value is readonly string[] => Array.isArray(value) && value.every((item) => typeof item === "string");
const optionalStrings = (value: unknown): boolean => value === undefined || strings(value);
const optionalString = (value: unknown): boolean => value === undefined || typeof value === "string";
const optionalBoolean = (value: unknown): boolean => value === undefined || typeof value === "boolean";
const channel = (value: unknown): boolean => value === "native" || value === "canvas" || value === "text" || value === "needs-input";
const option = (value: unknown): boolean => record(value) && typeof value.label === "string" && optionalString(value.key);
const question = (value: unknown): value is Question => record(value) && typeof value.explanation === "string" && (
  value.kind === "confirm"
    ? typeof value.acceptLabel === "string" && typeof value.declineLabel === "string" && value.safeDefault === "decline"
    : (value.kind === "single" || value.kind === "several") && value.allowOther === true && Array.isArray(value.options)
      && value.options.length > 0 && value.options.every(option));
const context = (value: unknown): value is DecisionContext => record(value) && typeof value.instance === "string"
  && question(value.question) && strings(value.displayedKeys) && typeof value.answered === "boolean" && channel(value.channel)
  && optionalBoolean(value.allowNone) && optionalStrings(value.pendingCustomKeys) && optionalString(value.acceptKey);
const capability = (value: unknown): boolean => value === null || record(value) && [value.single, value.several, value.consent, value.custom].every((item) => typeof item === "boolean") && optionalBoolean(value.optionalOnly);
const capabilities = (value: unknown): value is QuestionCapabilities => record(value) && capability(value.native) && capability(value.canvas) && typeof value.reply === "boolean";
const response = (value: unknown): value is QuestionResponse => record(value) && typeof value.instance === "string" && (
  value.channel === "dismissed" || value.channel === "text" && typeof value.value === "string"
  || (value.channel === "native" || value.channel === "canvas") && strings(value.keys) && optionalString(value.custom));
const elicitationState = (value: unknown): boolean => value === undefined || record(value) && (
  value.kind === "done" || value.kind === "selecting" && strings(value.methods)
  || (value.kind === "running" || value.kind === "reviewing") && strings(value.methods) && strings(value.selected));
const elicitationAction = (value: unknown): boolean => record(value) && (
  (value.kind === "offer" || value.kind === "choose") && strings(value.methods)
  || value.kind === "review" || value.kind === "apply" || value.kind === "reject" || value.kind === "proceed");
const activeState = (value: RecordValue): boolean => typeof value.session === "string" && Number.isSafeInteger(value.occurrence)
  && typeof value.node === "string" && optionalString(value.revision) && elicitationState(value.elicitation) && optionalStrings(value.elicitationEvents);
const pending = (value: unknown): boolean => record(value) && channel(value.kind) && typeof value.instance === "string"
  && question(value.question) && strings(value.displayedKeys) && strings(value.answerForms) && context(value.continuation)
  && value.instance === value.continuation.instance && value.kind === value.continuation.channel;
export const questionWording = (value: unknown): value is QuestionWording => record(value) && typeof value.explanation === "string"
  && record(value.labels) && Object.values(value.labels).every((item) => typeof item === "string");
const facts = (value: unknown): boolean => record(value) && Object.entries(value).every(([key, item]) => ["clear", "discuss", "small", "design"].includes(key) && typeof item === "boolean");
export const discoveryState = (value: unknown): value is DiscoveryState => record(value) && (
  value.phase === "paused" ? record(value.previous) && value.previous.phase !== "paused" && discoveryState(value.previous)
    : activeState(value) && (value.phase === "active" || value.phase === "waiting" && optionalString(value.clarification) && pending(value.pending)));
const discoveryEvent = (value: unknown): value is DiscoveryEvent => record(value) && (
  (value.kind === "ask" || value.kind === "connect") && capabilities(value.capabilities) && optionalString(value.language) && (value.wording === undefined || questionWording(value.wording))
  || value.kind === "answer" && response(value.response) && optionalString(value.revision)
  || value.kind === "recover-input" && typeof value.instance === "string" && typeof value.reply === "boolean"
  || value.kind === "facts" && facts(value.facts) && optionalString(value.context)
  || value.kind === "advance" && optionalString(value.revision)
  || value.kind === "review-revision" && typeof value.revision === "string"
  || value.kind === "elicitation" && typeof value.session === "string" && Number.isSafeInteger(value.occurrence) && typeof value.eventId === "string" && elicitationAction(value.action)
  || value.kind === "pause" || value.kind === "resume" || value.kind === "retry");

type Input = { readonly ok: true; readonly value: unknown } | { readonly ok: false };
const parse = (text: string): Input => {
  try { return { ok: true, value: JSON.parse(text) as unknown }; }
  catch { return { ok: false }; }
};
type Io = { readonly out: (line: string) => void; readonly err: (line: string) => void };
const HELP = `Usage: agent-plugin question prepare|answer|next <json>

Pass JSON as one argument with safe shell quoting; never interpolate user text into a shell command.

prepare accepts {"context": ..., "capabilities": ..., "required": true|false}.
The context contains instance, question, displayedKeys, answered, and channel (use "needs-input" initially).
Choice questions use kind "single" or "several", explanation, options with key and label, and allowOther: true.
Confirmations use kind "confirm", explanation, acceptLabel, declineLabel, safeDefault: "decline", and context.acceptKey.
Capabilities contain native and canvas (null or {single, several, consent, custom, optionalOnly?} booleans) and reply (boolean).
answer accepts {"context": <continuation>, "response": ...}. Responses contain instance and channel:
text uses value; native or canvas use keys and optional custom; dismissed has no answer fields.
For needs-custom, set continuation.pendingCustomKeys to the returned keys before submitting the literal custom text.
After one answer, set continuation.answered to true; resume needs-input by preparing again with current capabilities.

next accepts {"state": ..., "event": ...}. Start a discovery session with state
{"session":"<unique session>","occurrence":0,"node":"context","phase":"active"}.
Read without an event; send {"kind":"ask","capabilities":...} to prepare a decision.
Explicit facts can resolve context ({clear, discuss}) and sizing ({small, design}) when exactly one direction applies. Include relevant context in the event; missing or conflicting facts return recovery.
Pass the project's saved language in the ask event. English uses the authored wording; for another language, supply wording {explanation, labels: {<direction key>: <localized label>}} without changing the stable direction keys.
Keep the returned state and use pending.question, pending.answerForms and pending.continuation.
For needs-input, reconnect with {"kind":"connect","capabilities":...}; then send
{"kind":"answer","response":...,"revision":...} with the matching decision instance and reviewed revision.
If native input fails, send {"kind":"recover-input","instance":<pending instance>,"reply":true|false}.
Use the returned replacement decision for text or unattended recovery; the old instance cannot answer it.
Use advance for a single available direction, with revision when entering review;
use review-revision to invalidate an obsolete review, and pause/resume to suspend or restore.
After clarifying a custom answer, use retry to create a fresh decision before asking again.
At elicitation, send {"kind":"elicitation","session":...,"occurrence":...,"eventId":...,"action":...}, using a fresh event ID for each new action and the same ID for a retry.
Actions are offer or choose with methods (stable method IDs), review, apply, reject, and proceed.
Obtain method IDs from the existing elicitation catalog and normalize the user's selection through the shared question contract. Run and show the selected work at the host boundary; only an explicit apply or reject event records that choice.`;
const invalid = (io: Io): number => (io.err(JSON.stringify({ kind: "invalid-input", message: "Provide a valid question request as one JSON argument." })), 2);
const output = (io: Io, value: unknown): number => (io.out(JSON.stringify(value)), 0);
const executeRecord = (io: Io, operation: string | undefined, value: RecordValue): number => {
  switch (true) {
    case operation === "prepare" && context(value.context) && capabilities(value.capabilities) && typeof value.required === "boolean":
      return output(io, prepareQuestion(value.context, value.capabilities, value.required));
    case operation === "answer" && context(value.context) && response(value.response):
      return output(io, normalizeQuestionAnswer(value.context, value.response));
    case operation === "next" && (value.state === undefined || discoveryState(value.state)) && (value.event === undefined || discoveryEvent(value.event)):
      return output(io, nextDiscovery(value.state as DiscoveryState | undefined, value.event as DiscoveryEvent | undefined));
    default: return invalid(io);
  }
};
const execute = (io: Io, operation: string | undefined, value: unknown): number =>
  record(value) ? executeRecord(io, operation, value) : invalid(io);

/** CLI boundary for the shared, stateless host decision contract. */
export const runQuestion = (io: Io, args: readonly string[]): number => {
  const [operation, input, ...rest] = args;
  const parsed = input === undefined ? { ok: false } as const : parse(input);
  return (operation === "--help" || operation === "help") && input === undefined ? (io.out(HELP), 0)
    : rest.length > 0 || !parsed.ok ? invalid(io) : execute(io, operation, parsed.value);
};
