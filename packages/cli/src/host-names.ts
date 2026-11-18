import type { VendorId } from "@agent-plugins/compiler";

/** Hosts whose plugins setup can install and discover for one project; each is also a payload vendor. */
export const HOST_NAMES = Object.freeze(["codex", "claude"] as const) satisfies readonly VendorId[];
export type HostName = (typeof HOST_NAMES)[number];
export const isHostName = (value: unknown): value is HostName => (HOST_NAMES as readonly unknown[]).includes(value);
