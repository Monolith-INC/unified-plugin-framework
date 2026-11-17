import { canonicalText, sha256 } from "@agent-plugins/compiler";
import type { ContentView } from "./adapter.js";

export interface ContentSelection {
  readonly plugin: string;
  readonly skill: string;
  readonly path: string;
  readonly heading: string;
  readonly start: string;
  readonly end: string;
}
export type SelectedContent = { readonly ok: true; readonly views: readonly ContentView[] } | { readonly ok: false; readonly problems: readonly string[] };

/** Provider-specific instructions never enter the scoped content view. */
export const providerLeak = (text: string): boolean => /\b(?:Azure|Linear|Jira|Confluence)\b|\bwit_\w+|System\.[A-Z]|Microsoft\.VSTS|azure-mechanics|common\/providers/i.test(text);

const selectedText = (source: string, selection: ContentSelection): string | undefined => {
  const start = source.indexOf(selection.start);
  const end = source.indexOf(selection.end, start + selection.start.length);
  return start < 0 || source.indexOf(selection.start, start + 1) >= 0 || end < 0
    || source.indexOf(selection.end, end + selection.end.length) >= 0 ? undefined : source.slice(start, end).trim();
};
const select = (files: ReadonlyMap<string, string>, selection: ContentSelection): ContentView | string => {
  const source = canonicalText(files.get(selection.path) ?? "");
  const content = selectedText(source, selection);
  return content === undefined || providerLeak(content)
    ? `Cannot select provider-free content ${selection.path}: ${selection.heading}. Review the published section before updating its view.`
    : { plugin: selection.plugin, skill: selection.skill, path: selection.path, heading: selection.heading, sourceDigest: sha256(source), content };
};

/** Pure release-time extraction; a missing/ambiguous boundary is a failure, not a partial excerpt. */
export const selectContent = (files: ReadonlyMap<string, string>, selections: readonly ContentSelection[]): SelectedContent => {
  const selected = selections.map((selection) => select(files, selection));
  const problems = selected.filter((result): result is string => typeof result === "string");
  return problems.length > 0 ? { ok: false, problems } : { ok: true, views: selected.filter((result): result is ContentView => typeof result !== "string") };
};
