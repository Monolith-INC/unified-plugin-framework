# AGE-157 discovery storyboard design

## Grounding

The existing discovery adapter delegates to the brainstorming skill; its route covers context,
conversation, playback, sizing, and, when needed, a written design and review. The approved plan
adds elicitation and requires the directions after it to be visible. The next-action and elicitation
reducers belong to AGE-158 and AGE-159 respectively.

## Candidates

1. A declarative route with nodes and directions, validated for missing references and reachability.
2. A phase-specific transition function with separate state variants for conversation and elicitation.

Both independent sketches were provisional because their design agents could not read the checkout.
The synthesis below was checked against the existing adapter, delegated skill, and approved plan.

## Decision and contract

Use the declarative route for this task: `DISCOVERY_STORYBOARD` is the single route description;
`validateDiscoveryStoryboard(route)` returns either success or typed reference/reachability issues;
`resolveDiscoveryStep(saved)` returns a node, or an invalid-state result with restart/pause recovery.
Missing state selects the entry. Nodes expose their directions, including the two paths after
elicitation. The route stores no session state and performs no effects.

The phase-specific reducer is deferred to the planned AGE-158/159 slices. Implementing it now
would create transition ownership ahead of the agreed order. Those slices must consume this route
rather than introduce another route table.
