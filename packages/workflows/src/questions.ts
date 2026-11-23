import type { Monoid, NonEmpty } from "./adapter.js";

/** One selectable answer in a fixed-answer question. */
export interface QuestionOption {
  readonly key?: string;
  readonly label: string;
  readonly description?: string;
  readonly recommended?: boolean;
  readonly group?: string;
}

/** Single-choice question presented as native buttons or a numbered list with an "Other" escape hatch. */
export interface SingleQuestion {
  readonly kind: "single";
  readonly explanation: string;
  readonly options: NonEmpty<QuestionOption>;
  readonly allowOther: true;
}

/** Multi-choice question presented as native checkboxes (grouped when long) or a numbered list with "Other". */
export interface SeveralQuestion {
  readonly kind: "several";
  readonly explanation: string;
  readonly options: NonEmpty<QuestionOption>;
  readonly allowOther: true;
}

/** Two-button confirmation or consent prompt whose safe default is always decline. */
export interface ConfirmQuestion {
  readonly kind: "confirm";
  readonly explanation: string;
  readonly acceptLabel: string;
  readonly declineLabel: string;
  readonly safeDefault: "decline";
}

/** Closed union of fixed-answer session questions; open-ended questions stay typed and are not modelled here. */
export type Question = SingleQuestion | SeveralQuestion | ConfirmQuestion;

/** A group of at most `maxPerGroup` options for hosts with per-question option limits. */
export interface OptionGroup {
  readonly name: string;
  readonly options: readonly QuestionOption[];
}

export type WordingFindingCode =
  | "empty-explanation"
  | "doc-or-ticket-reference"
  | "unexplained-acronym"
  | "missing-other"
  | "unsafe-confirm-default";

/** A single wording or safety defect found on a fixed-answer question. */
export interface WordingFinding {
  readonly code: WordingFindingCode;
  readonly field: string;
  readonly message: string;
}

/** Lawful monoid combining wording findings in encounter order; the empty list is the identity. */
export const wordingFindings: Monoid<readonly WordingFinding[]> = Object.freeze({
  empty: Object.freeze([] as readonly WordingFinding[]),
  concat: (x: readonly WordingFinding[], y: readonly WordingFinding[]): readonly WordingFinding[] =>
    Object.freeze([...x, ...y]),
});

/** Folds a list of values with a monoid from its identity. */
export const concatAll =
  <A>(monoid: Monoid<A>) =>
  (items: readonly A[]): A =>
    items.reduce(monoid.concat, monoid.empty);

/** Shared interaction presentation rules embedded once into every rendered workflow skill. */
export const SHARED_INTERACTION_SECTION: string = [
  "## Presenting questions to the user",
  "",
  "For fixed-answer questions (single choice, multiple choice, or yes/no consent), use the host's native structured-question tool when it is available and supports the decision (`request_user_input` on Codex, `AskUserQuestion` on Claude Code, `AskQuestion` on Cursor, `ask_question` on Antigravity). This also applies to concrete choices from delegated skills.",
  "",
  "- **Single choice:** put the recommended option first and include an **Other** option (unless the host tool adds **Other** automatically) so the user can type a custom answer.",
  "- **Multiple choice:** let the user select any combination and include an **Other** option. Group lists of more than 4 options only when the chosen channel can carry the complete decision; otherwise choose a suitable fallback through the shared decision contract.",
  "- **Confirmation and consent:** show two clear choices with the safe decline option as the default. Closing the prompt or sending an empty reply never counts as yes.",
  "- **Plain wording:** write every prompt and option in the project's saved language without ticket IDs, internal document paths, or unexplained abbreviations.",
  "- **Numbered fallback (never unnumbered `-` bullets):** when the host lacks a suitable structured-question tool but a reply channel exists, print a numbered list (`1.`, `2.`, ...) ending with **Other (type your own answer)**, state the expected reply format (for example, one number or comma-separated numbers), and re-ask cleanly if the reply does not match.",
  "- **No reply channel:** yield a needs-input result with the pending question, permitted answers and continuation context, without reading stdin or performing the protected action. Resume only when an explicit matching answer arrives.",
  "- **One decision, one answer channel:** use a native control only if it can carry the full answer, custom text and required consent; an optional-only prompt cannot carry a required decision. Otherwise use a suitable interactive canvas or numbered text when replies are available. Associate each response with the current decision instance and stable option keys, decode numbers against the displayed order, preserve custom text literally, and ignore stale or repeated callbacks. A dismissal or ambiguous response is not consent; ask again or stop safely.",
  "- **Shared decision contract:** for general questions, call `agent-plugin question prepare <json>` with the question, decision instance, displayed option keys and observed host capabilities (`agent-plugin question --help` describes the inputs). Present only the returned channel. Pass its continuation and each matching host response to `agent-plugin question answer <json>`; use the returned event, not the raw response. Retain the continuation while waiting and mark it answered after one answer. For `needs-custom`, put the returned keys in `continuation.pendingCustomKeys` and ask for the literal text. For discovery directions, use `agent-plugin question next <json>` for preparation and responses, retaining its state and following its returned continuation.",
  "- **Open questions:** keep purely open-ended questions typed; do not force open answers into buttons, and do not append unnumbered option menus to open questions.",
].join("\n");

/** Host-neutral layouts; the host supplies runtime content and owns presentation effects. */
export const PRESENTATION_BLUEPRINTS: string = [
  "## Reusable presentation blueprints",
  "",
  "Fill these layouts with the current work and saved language. The named slots are runtime values, not build tokens. Use an accessible text version whenever a suitable canvas is unavailable. A blueprint never stores state or makes a decision.",
  "",
  "### Artifact blueprint",
  "Use for a plan or work item. Slots: title, purpose, actual content or accessible link, relevant context, and next action. Layout: title and purpose first; then the content or link; then context and next action. Controls: open the link where supported. Text fallback: show those same fields in reading order; include enough actual content to assess the work.",
  "Example plan: title 'Migration plan'; purpose 'Move the data'; content 'Back up, migrate, verify'; next action 'Review the plan'. Example work item: title 'Add export'; purpose 'Allow downloads'; content 'Requirements and acceptance conditions'; next action 'Implement the task'.",
  "",
  "### Choice blueprint",
  "Use for a fixed-choice decision. Slots: question, ordered options with stable keys, relevant context, and an open custom answer. Layout: question and context followed by options and custom-answer affordance. Controls: use only the channel selected by the shared decision contract. An accompanying canvas is informational when a native prompt owns the answer. Text fallback: use the numbered question fallback and preserve the literal custom answer.",
  "Example: question 'Which format?'; options 'CSV' and 'JSON'; custom answer 'Other'. The answer is normalized against the displayed keys, not an inferred choice.",
  "",
  "### Review blueprint",
  "Use only when a decision about work is required. Slots: actual material or an accessible link, context, shown revision, decision instance, and available actions. Layout: show the material and its context before the revision and decision. Controls: use the one selected answer channel; display alone is not approval. Text fallback: include the content or usable link, shown revision, and a numbered decision. Bind any approval to the shown revision and decision instance. If the material changes, show the new revision and obtain a fresh decision before acting; do not create extra approvals.",
  "Example: show the proposed plan or its accessible link, identify revision r1, then ask whether to approve it. If it changes to r2, show r2 before accepting an approval for r2.",
].join("\n");

const DEFAULT_GROUP = "Options";
const DEFAULT_MAX_PER_GROUP = 4;

const chunk = <A>(items: readonly A[], size: number): readonly (readonly A[])[] => {
  const safeSize = Math.max(1, Math.floor(size));
  const count = Math.ceil(items.length / safeSize);
  return Object.freeze(
    Array.from({ length: count }, (_, index) => Object.freeze(items.slice(index * safeSize, (index + 1) * safeSize))),
  );
};

const groupName = (group: string | undefined): string => {
  const trimmed = group?.trim() ?? "";
  return trimmed === "" ? DEFAULT_GROUP : trimmed;
};

/** Splits options into ordered groups of at most `maxPerGroup` items so long lists fit host UI limits. Pure. */
export const groupOptions = (
  options: readonly QuestionOption[],
  maxPerGroup: number = DEFAULT_MAX_PER_GROUP,
): readonly OptionGroup[] => {
  const groupNames = [...new Set(options.map((option) => groupName(option.group)))];
  return Object.freeze(
    groupNames.flatMap((name) => {
      const members = options.filter((option) => groupName(option.group) === name);
      const chunks = chunk(members, maxPerGroup);
      return chunks.map((slice, index) =>
        Object.freeze({
          name: chunks.length === 1 ? name : `${name} (${index + 1}/${chunks.length})`,
          options: slice,
        }),
      );
    }),
  );
};

const orderRecommendedFirst = (options: readonly QuestionOption[]): readonly QuestionOption[] => [
  ...options.filter((option) => option.recommended === true),
  ...options.filter((option) => option.recommended !== true),
];

const formatOptionLabel = (option: QuestionOption): string =>
  `${option.recommended === true ? `${option.label} (Recommended)` : option.label}${option.description === undefined ? "" : ` — ${option.description}`}`;

const renderGroupedNative = (groups: readonly OptionGroup[]): readonly string[] =>
  groups.flatMap((group) => [
    `### ${group.name}`,
    ...group.options.map((option) => `- ${formatOptionLabel(option)}`),
    "- Other (type your own answer)",
  ]);

/** Renders concise native-host UI instructions for a fixed-answer question. Pure. */
export const renderNativeQuestionGuidance = (question: Question): string => {
  switch (question.kind) {
    case "single": {
      const ordered = orderRecommendedFirst(question.options);
      return [
        question.explanation,
        "",
        "Present as a native single-choice prompt (buttons):",
        ...ordered.map((option) => `- ${formatOptionLabel(option)}`),
        "- Other (type your own answer)",
      ].join("\n");
    }
    case "several": {
      const ordered = orderRecommendedFirst(question.options);
      const groups = groupOptions(ordered);
      const body =
        groups.length === 1 && ordered.length <= DEFAULT_MAX_PER_GROUP
          ? [...ordered.map((option) => `- ${formatOptionLabel(option)}`), "- Other (type your own answer)"]
          : renderGroupedNative(groups);
      return [
        question.explanation,
        "",
        "Present as native multi-select controls (at most 4 options per group):",
        ...body,
      ].join("\n");
    }
    case "confirm":
      return [
        question.explanation,
        "",
        "Present as a native two-button confirmation:",
        `- ${question.acceptLabel}`,
        `- ${question.declineLabel} (safe default; closing or an empty reply is not consent)`,
      ].join("\n");
  }
};

/** Renders a deterministic numbered-text fallback for hosts without native selection controls. Pure. */
export const renderNumberedFallback = (question: Question): string => {
  switch (question.kind) {
    case "single": {
      const ordered = orderRecommendedFirst(question.options);
      const rows = ordered.map((option, index) => `${index + 1}. ${formatOptionLabel(option)}`);
      const otherIndex = ordered.length + 1;
      return [
        question.explanation,
        "",
        ...rows,
        `${otherIndex}. Other (type your own answer)`,
        "",
        `Reply with a number (1–${otherIndex}) or type your own answer. If the reply does not match, re-ask once with the valid range.`,
      ].join("\n");
    }
    case "several": {
      const ordered = orderRecommendedFirst(question.options);
      const rows = ordered.map((option, index) => `${index + 1}. ${formatOptionLabel(option)}`);
      const otherIndex = ordered.length + 1;
      return [
        question.explanation,
        "",
        ...rows,
        `${otherIndex}. Other (type your own answer)`,
        "",
        `Reply with comma-separated numbers (for example, 1, 3), "none", or type your own answer. If the reply does not match, re-ask once with the valid format.`,
      ].join("\n");
    }
    case "confirm":
      return [
        question.explanation,
        "",
        `1. ${question.acceptLabel}`,
        `2. ${question.declineLabel} (default)`,
        "",
        "Reply with 1 or 2. An empty reply or closing the prompt is not an answer; ask again or stop safely.",
      ].join("\n");
  }
};

const DOC_OR_TICKET_PATTERN =
  /\b[A-Z]{2,10}-\d+\b|(?:docs|packages|skills|scripts|\.upf-tools|io\.github\.monolith-inc\.upf)\/|\b[\w.-]+\.(?:md|json|toml)\b/i;
const ACRONYM_PATTERN = /\b[A-Z]{2,}\b/g;
const ALLOWED_TOKENS: ReadonlySet<string> = new Set(["OK"]);

const isExplainedInText = (text: string, token: string): boolean =>
  new RegExp(`\\(${token}\\)|${token}\\s*\\(`).test(text);

const unexplainedAcronyms = (text: string, context: string = ""): readonly string[] =>
  [...new Set([...text.matchAll(ACRONYM_PATTERN)].map(([match]) => match))].filter(
    (token) => !ALLOWED_TOKENS.has(token) && !isExplainedInText(text, token) && !isExplainedInText(context, token),
  );

const checkTextField = (field: string, text: string, context: string = ""): readonly WordingFinding[] => {
  const docFindings: readonly WordingFinding[] = DOC_OR_TICKET_PATTERN.test(text)
    ? [
        Object.freeze({
          code: "doc-or-ticket-reference" as const,
          field,
          message: `${field} must not reference internal tickets or document paths.`,
        }),
      ]
    : [];
  const acronymFindings: readonly WordingFinding[] = unexplainedAcronyms(text, context).map((token) =>
    Object.freeze({
      code: "unexplained-acronym" as const,
      field,
      message: `${field} uses unexplained abbreviation "${token}".`,
    }),
  );
  return concatAll(wordingFindings)([docFindings, acronymFindings]);
};

const checkExplanation = (explanation: string): readonly WordingFinding[] =>
  explanation.trim().length === 0
    ? Object.freeze([
        Object.freeze({
          code: "empty-explanation" as const,
          field: "explanation",
          message: "Question explanation must not be empty.",
        }),
      ])
    : checkTextField("explanation", explanation);

const checkOption =
  (explanation: string) =>
  (option: QuestionOption, index: number): readonly WordingFinding[] =>
    concatAll(wordingFindings)([
      checkTextField(`options[${index}].label`, option.label, explanation),
      option.description === undefined
        ? wordingFindings.empty
        : checkTextField(`options[${index}].description`, option.description, explanation),
    ]);

/** Checks a fixed-answer question for plain wording, safety defaults, and escape hatches. Pure. */
export const checkQuestionWording = (question: Question): readonly WordingFinding[] => {
  const base = checkExplanation(question.explanation);
  switch (question.kind) {
    case "single":
    case "several": {
      const optionFindings = concatAll(wordingFindings)(question.options.map(checkOption(question.explanation)));
      const otherFindings: readonly WordingFinding[] =
        (question.allowOther as boolean) === true
          ? wordingFindings.empty
          : Object.freeze([
              Object.freeze({
                code: "missing-other" as const,
                field: "allowOther",
                message: "Choice questions must enable an Other option.",
              }),
            ]);
      return concatAll(wordingFindings)([base, optionFindings, otherFindings]);
    }
    case "confirm": {
      const labelFindings = concatAll(wordingFindings)([
        checkTextField("acceptLabel", question.acceptLabel, question.explanation),
        checkTextField("declineLabel", question.declineLabel, question.explanation),
      ]);
      const defaultFindings: readonly WordingFinding[] =
        (question.safeDefault as string) === "decline"
          ? wordingFindings.empty
          : Object.freeze([
              Object.freeze({
                code: "unsafe-confirm-default" as const,
                field: "safeDefault",
                message: 'Confirmation questions must use "decline" as the safe default.',
              }),
            ]);
      return concatAll(wordingFindings)([base, labelFindings, defaultFindings]);
    }
  }
};
