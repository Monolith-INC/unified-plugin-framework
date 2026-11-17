/** A release version: major, minor, patch. Pre-release and build tags are not versions an onboarded plugin pins. */
export type Version = readonly [number, number, number];

/** The version ranges a framework manifest may declare: an exact `x.y.z`, `^x.y.z` or `~x.y.z`. */
export type VersionRange =
  | { readonly kind: "exact"; readonly floor: Version }
  | { readonly kind: "caret"; readonly floor: Version }
  | { readonly kind: "tilde"; readonly floor: Version };

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

export const parseVersion = (text: string): Version | undefined => {
  const match = VERSION.exec(text);
  return match === null ? undefined : [Number(match[1]), Number(match[2]), Number(match[3])];
};

const RANGE_KINDS: ReadonlyMap<string, VersionRange["kind"]> = new Map([
  ["^", "caret"],
  ["~", "tilde"],
]);

/** A declared range, or `undefined` for syntax this framework does not support. */
export const parseRange = (text: string): VersionRange | undefined => {
  const kind = RANGE_KINDS.get(text.slice(0, 1));
  const floor = parseVersion(kind === undefined ? text : text.slice(1));
  return floor === undefined ? undefined : { kind: kind ?? "exact", floor };
};

const compare = (x: Version, y: Version): number => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];

/** The first version a range excludes: `^` keeps the leftmost non-zero part, `~` keeps major and minor. */
const ceiling = (range: VersionRange): Version => {
  const [major, minor, patch] = range.floor;
  switch (range.kind) {
    case "exact":
      return [major, minor, patch + 1];
    case "caret":
      return major > 0 ? [major + 1, 0, 0] : minor > 0 ? [0, minor + 1, 0] : [0, 0, patch + 1];
    case "tilde":
      return [major, minor + 1, 0];
  }
};

/** Whether a version string is inside a range; a string that is not a release version never is. */
export const satisfies = (version: string, range: VersionRange): boolean => {
  const candidate = parseVersion(version);
  return candidate !== undefined && compare(candidate, range.floor) >= 0 && compare(candidate, ceiling(range)) < 0;
};
