/** Who maintains a plugin: a non-empty name, plus an optional contact email and URL. */
export type PluginAuthor = {
  readonly name: string;
  readonly email?: string;
  readonly url?: string;
};

const AUTHOR_FIELDS: ReadonlySet<string> = new Set(["name", "email", "url"]);

const isAbsentOrString = (entry: unknown): boolean => entry === undefined || typeof entry === "string";

const isObject = (entry: unknown): entry is Readonly<Record<string, unknown>> =>
  typeof entry === "object" && entry !== null && !Array.isArray(entry);

/**
 * An author object with a non-empty name, string contacts when present, and no other keys. Hosts such as
 * Claude Code require the name, so a nameless author is refused here rather than by one host later.
 */
export const isPluginAuthor = (entry: unknown): entry is PluginAuthor =>
  isObject(entry) &&
  typeof entry["name"] === "string" &&
  entry["name"].trim().length > 0 &&
  isAbsentOrString(entry["email"]) &&
  isAbsentOrString(entry["url"]) &&
  Object.keys(entry).every((key) => AUTHOR_FIELDS.has(key));
