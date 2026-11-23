import { nextDiscovery, normalizeQuestionAnswer, prepareQuestion, type DecisionContext, type DiscoveryEvent, type DiscoveryState, type Question, type QuestionCapabilities, type QuestionResponse } from "@agent-plugins/workflows";

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
const activeState = (value: RecordValue): boolean => typeof value.session === "string" && Number.isSafeInteger(value.occurrence)
  && typeof value.node === "string" && optionalString(value.revision);
const pending = (value: unknown): boolean => record(value) && channel(value.kind) && typeof value.instance === "string"
  && question(value.question) && strings(value.displayedKeys) && strings(value.answerForms) && context(value.continuation)
  && value.instance === value.continuation.instance && value.kind === value.continuation.channel;
const discoveryState = (value: unknown): value is DiscoveryState => record(value) && (
  value.phase === "paused" ? record(value.previous) && value.previous.phase !== "paused" && discoveryState(value.previous)
    : activeState(value) && (value.phase === "active" || value.phase === "waiting" && pending(value.pending)));
const discoveryEvent = (value: unknown): value is DiscoveryEvent => record(value) && (
  (value.kind === "ask" || value.kind === "connect") && capabilities(value.capabilities)
  || value.kind === "answer" && response(value.response) && optionalString(value.revision)
  || value.kind === "advance" && optionalString(value.revision)
  || value.kind === "review-revision" && typeof value.revision === "string"
  || value.kind === "pause" || value.kind === "resume");

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
Keep the returned state and use pending.question, pending.answerForms and pending.continuation.
For needs-input, reconnect with {"kind":"connect","capabilities":...}; then send
{"kind":"answer","response":...,"revision":...} with the matching decision instance and reviewed revision.
Use advance for a single available direction, with revision when entering review;
use review-revision to invalidate an obsolete review, and pause/resume to suspend or restore.`;
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
