import { PROJECT_KNOWLEDGE_SETUP, type PluginKnowledgeStore, type PluginSkillRef, type WorkflowAdapter } from "./adapter.js";

/** A rendered skill file, or why it could not be rendered. */
export type Rendered = { readonly ok: true; readonly text: string } | { readonly ok: false; readonly message: string };

const PLACEHOLDER = /\{\{([a-z]+)\}\}/g;

const qualified = ({ plugin, skill }: PluginSkillRef): string => `\`${plugin}:${skill}\``;

const delegate = (served: readonly PluginSkillRef[]): string => {
  const [only, ...others] = served;
  return only !== undefined && others.length === 0 && only.use === undefined
    ? `Use ${qualified(only)}, passing along the user's request and any flags.`
    : ["Hand the review to the skill that fits:", "", ...served.map((ref) => `- ${qualified(ref)}${ref.use === undefined ? "" : ` — ${ref.use}`}`)].join("\n");
};

const sharedStoreStep = (stores: readonly PluginKnowledgeStore[]): readonly string[] =>
  stores.length === 0
    ? []
    : [
        "3. **Shared store:** each plugin below must record the same directory as `knowledgeRoot`. If one does not, run its setup skill, give it the project knowledge store's directory as its knowledge store, then continue.",
        ...stores.map(({ plugin, file, key, setup }) => `   - \`${file}\` sets \`${key.join(".")}\`; setup skill \`${plugin}:${setup}\`.`),
      ];

const readiness = (adapter: WorkflowAdapter<string>, served: readonly PluginSkillRef[]): string =>
  [
    "## Check readiness and recover",
    "",
    "Before reviewing, check each step in order. When a step fails, take its recovery action and continue with the review. Involve the user only where a step says so, in one short message.",
    "",
    `1. **Available:** ${served.map(qualified).join(" and ")} ${served.length === 1 ? "is" : "are"} available in this session. If not, ask the user to install and enable ${[...new Set(served.map(({ plugin }) => `\`${plugin}\``))].join(", ")} for this host, then continue once it is.`,
    `2. **Project knowledge store:** \`.project-knowledge.json\` names a \`knowledgeRoot\`. If not, run ${qualified(PROJECT_KNOWLEDGE_SETUP)} with its recommended defaults, then continue.`,
    ...sharedStoreStep(adapter.knowledgeStores),
    "",
    `From a checkout, \`agent-plugin adapter-check ${adapter.workflow}\` runs the same checks and prints each recovery action.`,
  ].join("\n");

const generated = (adapter: WorkflowAdapter<string>, operation: string): string =>
  `<!-- Generated from packages/workflows/templates/${adapter.workflow}/${operation}.md and the ${adapter.workflow} adapter by \`pnpm payloads:build\`. Edit those, not this file. -->`;

const sections = (adapter: WorkflowAdapter<string>, operation: string, served: readonly PluginSkillRef[]): ReadonlyMap<string, string> =>
  new Map([
    ["generated", generated(adapter, operation)],
    ["readiness", readiness(adapter, served)],
    ["delegate", delegate(served)],
  ]);

const unknownPlaceholders = (template: string, known: ReadonlyMap<string, string>): readonly string[] =>
  [...template.matchAll(PLACEHOLDER)].map(([, name]) => name ?? "").filter((name) => !known.has(name));

/** Fills a skill template from the adapter's mapping for one operation. Pure. */
export const renderSkill = (template: string, adapter: WorkflowAdapter<string>, operation: string): Rendered => {
  const served = (adapter.fulfil as Readonly<Record<string, readonly PluginSkillRef[] | undefined>>)[operation];
  const known = served === undefined ? undefined : sections(adapter, operation, served);
  const unknown = known === undefined ? [] : unknownPlaceholders(template, known);
  return known === undefined
    ? { ok: false, message: `The ${adapter.workflow} adapter has no operation "${operation}".` }
    : unknown.length > 0
      ? { ok: false, message: `Unknown template placeholders: ${unknown.join(", ")}.` }
      : { ok: true, text: template.replace(PLACEHOLDER, (_match, name: string) => known.get(name) ?? "") };
};
