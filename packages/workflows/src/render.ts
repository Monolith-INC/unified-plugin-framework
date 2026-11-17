import {
  PROJECT_KNOWLEDGE_SETUP,
  type NonEmpty,
  type PluginKnowledgeStore,
  type PluginSkillRef,
  type WorkflowAdapter,
} from "./adapter.js";
import { LOCK_FILE, pinFor, type OnboardedLock, type PluginPin } from "./lock.js";

/** A rendered skill file, or why it could not be rendered. */
export type Rendered = { readonly ok: true; readonly text: string } | { readonly ok: false; readonly message: string };

const PLACEHOLDER = /\{\{([a-z]+)\}\}/g;

type Qualify = (ref: PluginSkillRef) => string;

/** How the agent invokes a plugin skill: `plugin:skill`, or the bare skill name for plugins installed without a prefix. */
const qualifiedBy =
  (adapter: WorkflowAdapter<string>): Qualify =>
  ({ plugin, skill }) =>
    adapter.bareSkillPlugins.includes(plugin) ? `\`${skill}\`` : `\`${plugin}:${skill}\``;

/** "a", "a and b", "a, b and c". */
const andList = (items: readonly string[]): string =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1] ?? ""}`;

const uniquePlugins = (refs: readonly PluginSkillRef[]): readonly string[] => [...new Set(refs.map(({ plugin }) => plugin))];

const listed = (qualify: Qualify, refs: readonly PluginSkillRef[]): readonly string[] =>
  refs.map((ref) => `- ${qualify(ref)}${ref.use === undefined ? "" : ` — ${ref.use}`}`);

const oneOf = (qualify: Qualify, served: NonEmpty<PluginSkillRef>): string => {
  const [only, ...others] = served;
  return others.length === 0 && only.use === undefined
    ? `Use ${qualify(only)}, passing along the user's request and any flags.`
    : ["Hand the work to the skill that fits:", "", ...listed(qualify, served)].join("\n");
};

const leadAndLayers = (qualify: Qualify, [lead, ...layers]: NonEmpty<PluginSkillRef>): string =>
  [
    `Run ${qualify(lead)} throughout, passing along the user's request and any starting material.`,
    ...(layers.length === 0 ? [] : ["", "Add these at the stages shown:", "", ...listed(qualify, layers)]),
  ].join("\n");

const delegate = (adapter: WorkflowAdapter<string>, qualify: Qualify, served: NonEmpty<PluginSkillRef>): string => {
  switch (adapter.composition) {
    case "one-of":
      return oneOf(qualify, served);
    case "lead-and-layers":
      return leadAndLayers(qualify, served);
    case "content-view":
      return contentView(adapter, served);
  }
};

const contentView = (adapter: WorkflowAdapter<string>, served: NonEmpty<PluginSkillRef>): string => [
  "Use only these reviewed content excerpts under this workflow's contract. They are content guidance, not calls to native workflow conductors or their follow-up skills/scripts. The project's saved choices and authorization govern execution.",
  ...(adapter.contentViews ?? []).filter((view) => served.some(({ plugin, skill }) => plugin === view.plugin && (view.skill === "*" || skill === view.skill)))
    .map((view) => `### ${view.heading}\n\nSource: ${view.plugin}, \`${view.path}\` (reviewed source ${view.sourceDigest}).\n\n${view.content}`),
].join("\n\n");

const sameEntry = (x: PluginSkillRef) => (y: PluginSkillRef): boolean =>
  x.plugin === y.plugin && x.skill === y.skill && x.use === y.use;

/** The catalog entries this operation does not already use, each with its own `use`. */
const offeredCatalog = (adapter: WorkflowAdapter<string>, served: readonly PluginSkillRef[]): readonly PluginSkillRef[] =>
  adapter.catalog.filter((entry) => !served.some(sameEntry(entry)));

const catalogBlock = (qualify: Qualify, offered: readonly PluginSkillRef[]): string =>
  offered.length === 0
    ? ""
    : [
        "## Optional skills",
        "",
        "Once, at the start, offer the user these skills to add to the session. Use any they choose at the point it fits.",
        "",
        ...listed(qualify, offered),
      ].join("\n");

/** The skills to look for: every one the operation runs, plus one offered skill of each other required plugin. */
const checkedSkills = (served: readonly PluginSkillRef[], offered: readonly PluginSkillRef[]): readonly PluginSkillRef[] => [
  ...served,
  ...uniquePlugins(offered)
    .filter((plugin) => !served.some((ref) => ref.plugin === plugin))
    .flatMap((plugin) => offered.find((ref) => ref.plugin === plugin) ?? []),
];

const sharedStoreStep = (qualify: Qualify, stores: readonly PluginKnowledgeStore[]): readonly string[] =>
  stores.length === 0
    ? []
    : [
        "3. **Shared store:** each plugin below must record the same directory as `knowledgeRoot`. If one does not, run its setup skill, give it the project knowledge store's directory as its knowledge store, then continue.",
        ...stores.map(({ plugin, file, key, setup }) => `   - \`${file}\` sets \`${key.join(".")}\`; setup skill ${qualify({ plugin, skill: setup })}.`),
      ];

/** The version each required plugin is pinned at; a heads-up for the user, never a reason to stop. */
const testedWith = (pins: readonly PluginPin[]): string =>
  ` This workflow is tested with ${andList(pins.map(({ plugin, version }) => `\`${plugin}\` ${version}`))}. If the session shows another version installed, mention it to the user once, in one line, and continue.`;

const readiness = (
  adapter: WorkflowAdapter<string>,
  qualify: Qualify,
  checked: readonly PluginSkillRef[],
  pins: readonly PluginPin[],
): string =>
  [
    "## Check readiness and recover",
    "",
    "Use the project's saved language for communication, documentation and other prose. Work-item actions go through `project-operations`, which uses the configured project adapter and runs `project-bootstrap` only when setup is missing. Do not choose a tracker or call its native tools from this workflow.",
    "",
    "Before starting, check each step in order. When a step fails, take its recovery action and continue. Involve the user only where a step says so, in one short message.",
    "",
    `1. **Available:** ${andList(checked.map(qualify))} ${checked.length === 1 ? "is" : "are"} available in this session. If not, ask the user to install and enable ${andList(pins.map(({ plugin }) => `\`${plugin}\``))} for this host, then continue once it is.${testedWith(pins)}`,
    `2. **Project knowledge store:** \`.project-knowledge.json\` names a \`knowledgeRoot\`. If not, run ${qualify(PROJECT_KNOWLEDGE_SETUP)} with its recommended defaults, then continue.`,
    ...sharedStoreStep(qualify, adapter.knowledgeStores),
  ].join("\n");

const generated = (adapter: WorkflowAdapter<string>, operation: string): string =>
  `<!-- Assembled at release time from the ${operation} template in plugins/unified-plugin-framework and the ${adapter.workflow} adapter. Edit those, not this copy. -->`;

/** Everything one operation renders from: the operation's skills, the catalog it offers, and the required plugins' pins. */
type Inputs = {
  readonly adapter: WorkflowAdapter<string>;
  readonly operation: string;
  readonly served: NonEmpty<PluginSkillRef>;
  readonly offered: readonly PluginSkillRef[];
  readonly pins: readonly PluginPin[];
};

const sections = ({ adapter, operation, served, offered, pins }: Inputs): ReadonlyMap<string, string> => {
  const qualify = qualifiedBy(adapter);
  return new Map([
    ["generated", generated(adapter, operation)],
    ["readiness", readiness(adapter, qualify, checkedSkills(served, offered), pins)],
    ["delegate", delegate(adapter, qualify, served)],
    ["catalog", catalogBlock(qualify, offered)],
    ...(adapter.protocol === undefined ? [] : [["protocol", adapter.protocol] as const]),
  ]);
};

/** Placeholders a template must contain: the catalog's only when this operation offers one. */
const requiredPlaceholders = (offered: readonly PluginSkillRef[]): readonly string[] =>
  offered.length === 0 ? ["generated", "readiness", "delegate"] : ["generated", "readiness", "delegate", "catalog"];

const placeholdersIn = (template: string): readonly string[] => [...template.matchAll(PLACEHOLDER)].map(([, name]) => name ?? "");

/** Why a template cannot be filled from these inputs, or `undefined` when it can. */
const templateProblem = (template: string, inputs: Inputs, known: ReadonlyMap<string, string>, unpinned: readonly string[]): string | undefined => {
  const present = placeholdersIn(template);
  const unknown = present.filter((name) => !known.has(name));
  const missing = requiredPlaceholders(inputs.offered).filter((name) => !present.includes(name));
  const missingView = inputs.adapter.composition === "content-view" && inputs.served.some((ref) =>
    !(inputs.adapter.contentViews ?? []).some((view) => view.plugin === ref.plugin && view.skill === ref.skill && view.content.trim().length > 0));
  return unknown.length > 0
    ? `Unknown template placeholders: ${unknown.join(", ")}.`
    : missing.length > 0
      ? `The ${inputs.operation} template is missing placeholders: ${missing.map((name) => `{{${name}}}`).join(", ")}.`
      : unpinned.length > 0
        ? `${unpinned.join(", ")} has no pin in ${LOCK_FILE}: pin it with agent-plugin upgrade-check before release.`
        : missingView
          ? `The ${inputs.operation} content view is incomplete; review and rebuild its published content selections.`
          : inputs.adapter.protocol !== undefined && !present.includes("protocol")
            ? `The ${inputs.operation} template is missing placeholders: {{protocol}}.`
            : undefined;
};

/** Fills a skill template from the adapter's mapping for one operation and the framework's lock. Pure. */
export const renderSkill = (template: string, adapter: WorkflowAdapter<string>, operation: string, lock: OnboardedLock): Rendered => {
  const served = (adapter.fulfil as Readonly<Record<string, NonEmpty<PluginSkillRef> | undefined>>)[operation];
  const offered = served === undefined ? [] : offeredCatalog(adapter, served);
  // Every plugin a session may use is required: the operation's and the catalog's, each installed and pinned.
  const required = served === undefined ? [] : uniquePlugins([...served, ...offered]);
  const pins = required.flatMap((plugin) => pinFor(lock, plugin, adapter.workflow) ?? []);
  const unpinned = required.filter((plugin) => pinFor(lock, plugin, adapter.workflow) === undefined);
  const inputs = served === undefined ? undefined : { adapter, operation, served, offered, pins };
  const known = inputs === undefined ? undefined : sections(inputs);
  const problem = inputs === undefined || known === undefined ? undefined : templateProblem(template, inputs, known, unpinned);
  return inputs === undefined || known === undefined
    ? { ok: false, message: `The ${adapter.workflow} adapter has no operation "${operation}".` }
    : problem !== undefined
      ? { ok: false, message: problem }
      : { ok: true, text: template.replace(PLACEHOLDER, (_match, name: string) => known.get(name) ?? "") };
};
