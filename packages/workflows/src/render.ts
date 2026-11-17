import { PROJECT_KNOWLEDGE_SETUP, type PluginKnowledgeStore, type PluginSkillRef, type WorkflowAdapter } from "./adapter.js";
import { LOCK_FILE, pinFor, type OnboardedLock, type PluginPin } from "./lock.js";

/** A rendered skill file, or why it could not be rendered. */
export type Rendered = { readonly ok: true; readonly text: string } | { readonly ok: false; readonly message: string };

const PLACEHOLDER = /\{\{([a-z]+)\}\}/g;

/** How the agent invokes a plugin skill: `plugin:skill`, or the bare skill name for plugins installed without a prefix. */
const qualifiedBy =
  (adapter: WorkflowAdapter<string>) =>
  ({ plugin, skill }: PluginSkillRef): string =>
    adapter.bareSkillPlugins.includes(plugin) ? `\`${skill}\`` : `\`${plugin}:${skill}\``;

const listed = (qualified: (ref: PluginSkillRef) => string, refs: readonly PluginSkillRef[]): readonly string[] =>
  refs.map((ref) => `- ${qualified(ref)}${ref.use === undefined ? "" : ` — ${ref.use}`}`);

const oneOf = (qualified: (ref: PluginSkillRef) => string, served: readonly PluginSkillRef[]): string => {
  const [only, ...others] = served;
  return only !== undefined && others.length === 0 && only.use === undefined
    ? `Use ${qualified(only)}, passing along the user's request and any flags.`
    : ["Hand the work to the skill that fits:", "", ...listed(qualified, served)].join("\n");
};

const leadAndLayers = (qualified: (ref: PluginSkillRef) => string, [lead, ...layers]: readonly PluginSkillRef[]): string =>
  [
    `Run ${lead === undefined ? "" : qualified(lead)} throughout, passing along the user's request and any starting material.`,
    ...(layers.length === 0 ? [] : ["", "Add these at the stages shown:", "", ...listed(qualified, layers)]),
  ].join("\n");

const delegate = (adapter: WorkflowAdapter<string>, served: readonly PluginSkillRef[]): string => {
  switch (adapter.composition) {
    case "one-of":
      return oneOf(qualifiedBy(adapter), served);
    case "lead-and-layers":
      return leadAndLayers(qualifiedBy(adapter), served);
  }
};

const sameSkill = (x: PluginSkillRef) => (y: PluginSkillRef): boolean => x.plugin === y.plugin && x.skill === y.skill;

/** The catalog skills this operation does not already use, offered once; empty when there are none. */
const catalog = (adapter: WorkflowAdapter<string>, served: readonly PluginSkillRef[]): string => {
  const offered = adapter.catalog.filter((entry) => !served.some(sameSkill(entry)));
  return offered.length === 0
    ? ""
    : [
        "## Optional skills",
        "",
        "Once, at the start, offer the user these skills to add to the session. Use any they choose at the point it fits.",
        "",
        ...listed(qualifiedBy(adapter), offered),
      ].join("\n");
};

const sharedStoreStep = (stores: readonly PluginKnowledgeStore[]): readonly string[] =>
  stores.length === 0
    ? []
    : [
        "3. **Shared store:** each plugin below must record the same directory as `knowledgeRoot`. If one does not, run its setup skill, give it the project knowledge store's directory as its knowledge store, then continue.",
        ...stores.map(({ plugin, file, key, setup }) => `   - \`${file}\` sets \`${key.join(".")}\`; setup skill \`${plugin}:${setup}\`.`),
      ];

/** "a", "a and b", "a, b and c". */
const andList = (items: readonly string[]): string =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1] ?? ""}`;

const servedPlugins = (served: readonly PluginSkillRef[]): readonly string[] => [...new Set(served.map(({ plugin }) => plugin))];

/** The version each served plugin is pinned at; a heads-up for the user, never a reason to stop. */
const testedWith = (pins: readonly PluginPin[]): string =>
  ` This workflow is tested with ${andList(pins.map(({ plugin, version }) => `\`${plugin}\` ${version}`))}. If the session shows another version installed, mention it to the user once, in one line, and continue.`;

const readiness = (adapter: WorkflowAdapter<string>, served: readonly PluginSkillRef[], pins: readonly PluginPin[]): string => {
  const qualified = qualifiedBy(adapter);
  return [
    "## Check readiness and recover",
    "",
    "Before starting, check each step in order. When a step fails, take its recovery action and continue. Involve the user only where a step says so, in one short message.",
    "",
    `1. **Available:** ${andList(served.map(qualified))} ${served.length === 1 ? "is" : "are"} available in this session. If not, ask the user to install and enable ${andList(servedPlugins([...served, ...adapter.catalog]).map((plugin) => `\`${plugin}\``))} for this host, then continue once it is.${testedWith(pins)}`,
    `2. **Project knowledge store:** \`.project-knowledge.json\` names a \`knowledgeRoot\`. If not, run \`${PROJECT_KNOWLEDGE_SETUP.plugin}:${PROJECT_KNOWLEDGE_SETUP.skill}\` with its recommended defaults, then continue.`,
    ...sharedStoreStep(adapter.knowledgeStores),
  ].join("\n");
};

const generated = (adapter: WorkflowAdapter<string>, operation: string): string =>
  `<!-- Assembled at release time from the ${operation} template in plugins/unified-plugin-framework and the ${adapter.workflow} adapter. Edit those, not this copy. -->`;

const sections = (
  adapter: WorkflowAdapter<string>,
  operation: string,
  served: readonly PluginSkillRef[],
  pins: readonly PluginPin[],
): ReadonlyMap<string, string> =>
  new Map([
    ["generated", generated(adapter, operation)],
    ["readiness", readiness(adapter, served, pins)],
    ["delegate", delegate(adapter, served)],
    ["catalog", catalog(adapter, served)],
  ]);

const unknownPlaceholders = (template: string, known: ReadonlyMap<string, string>): readonly string[] =>
  [...template.matchAll(PLACEHOLDER)].map(([, name]) => name ?? "").filter((name) => !known.has(name));

/** Fills a skill template from the adapter's mapping for one operation and the framework's lock. Pure. */
export const renderSkill = (template: string, adapter: WorkflowAdapter<string>, operation: string, lock: OnboardedLock): Rendered => {
  const served = (adapter.fulfil as Readonly<Record<string, readonly PluginSkillRef[] | undefined>>)[operation];
  // The catalog's plugins are required too: every skill a session may offer must be installed and pinned.
  const plugins = served === undefined ? [] : servedPlugins([...served, ...adapter.catalog]);
  const pins = plugins.flatMap((plugin) => pinFor(lock, plugin) ?? []);
  const unpinned = plugins.filter((plugin) => pinFor(lock, plugin) === undefined);
  const known = served === undefined ? undefined : sections(adapter, operation, served, pins);
  const unknown = known === undefined ? [] : unknownPlaceholders(template, known);
  return known === undefined
    ? { ok: false, message: `The ${adapter.workflow} adapter has no operation "${operation}".` }
    : unknown.length > 0
      ? { ok: false, message: `Unknown template placeholders: ${unknown.join(", ")}.` }
      : unpinned.length > 0
        ? { ok: false, message: `${unpinned.join(", ")} has no pin in ${LOCK_FILE}: pin it with agent-plugin upgrade-check before release.` }
        : { ok: true, text: template.replace(PLACEHOLDER, (_match, name: string) => known.get(name) ?? "") };
};
