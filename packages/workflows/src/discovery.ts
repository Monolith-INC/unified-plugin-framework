import type { PluginSkillRef, WorkflowAdapter } from "./adapter.js";

/** The Discovery workflow's contract with users and agents (ADR-001): four modes of rising rigor, depth and scope. */
export const DISCOVERY_OPERATIONS = Object.freeze([
  "discover-quick",
  "discover-thorough",
  "discover-comprehensive",
  "discover-research",
] as const);

export type DiscoveryOperation = (typeof DISCOVERY_OPERATIONS)[number];

export const DISCOVERY_CONTRACT_VERSION = "1.0.0";

export type DiscoveryAdapter = WorkflowAdapter<DiscoveryOperation>;

const SUPERPOWERS = "superpowers";
const BMAD = "bmad-method";

const ref = (plugin: string) => (skill: string, use: string): PluginSkillRef => Object.freeze({ plugin, skill, use });
const superpowers = ref(SUPERPOWERS);
const bmad = ref(BMAD);

const LEAD = superpowers("brainstorming", "Lead the whole session with it, from the first question to the written design.");

const ELICIT = bmad(
  "bmad-advanced-elicitation",
  "During the conversation: when an answer settles a key decision, push it further (first principles, pre-mortem, red team).",
);
const PERSPECTIVES = bmad("bmad-party-mode", "During the conversation: bring several perspectives to the hardest open question.");
const RESEARCH = bmad(
  "bmad-deep-recon",
  "During the conversation: research each open decision and bring back cited findings before the user chooses.",
);
const FORGE = bmad("bmad-forge-idea", "Before the written design: pressure-test the idea until the user can act on it or drop it.");
const WORKING_BACKWARDS = bmad(
  "bmad-prfaq",
  "Before the written design: write the press release and the hard questions first, to test the concept from the customer's side.",
);
const LENSES = bmad("bmad-review", "On the written design: run the adversarial and edge-case lenses, then revise the design with the user.");
const EVIDENCE = bmad(
  "bmad-review",
  "On the written design: run the verification-gaps lens, so every claim the design rests on cites its source.",
);
const BRIEF = bmad("bmad-product-brief", "On the written design: record it as a product brief when a product-level summary is enough.");
const PRD = bmad("bmad-prd", "On the written design: record it as a PRD when the work needs full requirements.");

/** Discovery led by Superpowers' brainstorming flow, with BMad Method's elicitation, hardening and verification layers. */
export const brainstormingDiscoveryAdapter: DiscoveryAdapter = Object.freeze({
  workflow: "discovery",
  contractVersion: DISCOVERY_CONTRACT_VERSION,
  composition: "lead-and-layers",
  fulfil: Object.freeze({
    "discover-quick": Object.freeze([LEAD] as const),
    "discover-thorough": Object.freeze([LEAD, ELICIT, FORGE, LENSES] as const),
    "discover-comprehensive": Object.freeze([LEAD, ELICIT, PERSPECTIVES, FORGE, WORKING_BACKWARDS, LENSES, BRIEF, PRD] as const),
    "discover-research": Object.freeze([LEAD, RESEARCH, EVIDENCE] as const),
  }),
  catalog: Object.freeze([
    bmad("bmad-brainstorming", "To widen the options with structured creative techniques."),
    bmad("bmad-spec", "To condense the design into a short spec that later skills build from."),
    bmad("bmad-ux", "To capture how the product looks and behaves."),
    ELICIT,
    PERSPECTIVES,
    RESEARCH,
    FORGE,
    WORKING_BACKWARDS,
    LENSES,
    BRIEF,
    PRD,
  ]),
  bareSkillPlugins: Object.freeze([BMAD]),
  knowledgeStores: Object.freeze([]),
});
