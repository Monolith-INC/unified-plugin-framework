# Meta-Prompting Analysis

## Current approach

The workflow currently tells an agent to prepare a decision, present one channel, translate its response, and invoke the answer command. These are instructions to the agent, not an automatic input/output boundary. The prior live check succeeded only because the agent constructed the normalized response.

## Risks

- An agent can fabricate or misinterpret a host response, map a display label to the wrong key, or repeat a completed decision.
- A prompt cannot guarantee a host hook exists, that a response is observable, or that an unattended session has a reply channel.
- A single generic host example can accidentally put vendor-specific assumptions into shared workflow logic.

## Proposed changes

The shared workflow should describe the host-neutral contract and failure behavior. Concrete host adapters own documented vendor-specific response translation and delivery. Instructions may guide an agent to invoke the adapter, but must not claim that natural-language instructions guarantee automatic delivery. Verify each supported host and distinguish documented capability, observed live behavior, and unsupported or unverified behavior.
