import { realpath, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { sha256 } from '@agent-plugins/compiler';
import { fail, object, ok, type Result } from '@agent-plugins/project';
import type { HostName } from './host-names.js';
import { HOSTS } from './host-table.js';
import { readJsonFromDisk } from './plugin-reader.js';
import { FRAMEWORK_ROOT, frameworkSkills } from './tooling-host.js';
import { readText, safePath } from './tooling-files.js';
import { RELEASE_VERSION } from './release-asset.js';

interface SkillOrigin {
  readonly path: string;
  readonly version: string | null;
}
interface SkillSource {
  readonly status: 'project' | 'different-source' | 'modified-project-skill';
  readonly selected: SkillOrigin;
  readonly expected: SkillOrigin;
  readonly matchesRelease: boolean;
}
const manifestVersion = (path: string): string | null => {
  const raw = readJsonFromDisk(path);
  return raw.kind === 'value' && object(raw.value) && raw.value.name === 'unified-plugin-framework'
    && typeof raw.value.version === 'string' && RELEASE_VERSION.test(raw.value.version) ? raw.value.version : null;
};
const invalid = (message: string): Result<never> =>
  fail('unverified-skill', message, 'Use the actual SKILL.md path the host opened, and run the project-local launcher from this project.');

/** Compare the observed invocation to the selected host's installed release. Directory scans alone cannot identify an invocation. */
export const skillSource = async (project: string, host: HostName, selected: string): Promise<Result<SkillSource>> => {
  if (!isAbsolute(selected) || basename(selected) !== 'SKILL.md') return invalid('Provide the absolute path of the invoked SKILL.md.');
  const actual = await realpath(selected).catch(() => null);
  if (actual === null) return invalid('The selected skill path cannot be resolved.');
  if (!await stat(actual).then((file) => file.isFile(), () => false)) return invalid('The selected skill is not a regular file.');
  const expected = frameworkSkills(project, host).find(({ name }) => name === basename(dirname(actual)));
  if (expected === undefined) return invalid('This skill name does not belong to this framework release.');
  const expectedPath = join(expected.source, 'SKILL.md');
  const [content, projectPath, safe] = await Promise.all([readText(actual), realpath(expectedPath).catch(() => null), safePath(project, expectedPath)]);
  if (!content.ok || content.value === null || projectPath === null || !safe) return invalid('The selected file or the project skill cannot be verified.');
  const projectVersion = manifestVersion(join(FRAMEWORK_ROOT, 'plugin.json'));
  const matchesRelease = sha256(Buffer.from(content.value)) === expected.sha256;
  const local = projectPath === actual;
  if (!local) {
    const installed = await readText(projectPath);
    if (!installed.ok || installed.value === null || sha256(Buffer.from(installed.value)) !== expected.sha256)
      return invalid('The installed project copy differs from the verified release. Reconcile the project skill before resuming.');
  }
  const selectedRoot = resolve(dirname(actual), '../..');
  const selectedVersion = local ? matchesRelease ? projectVersion : null : manifestVersion(join(selectedRoot, HOSTS[host].manifest)) ?? manifestVersion(join(selectedRoot, 'plugin.json'));
  return ok({ status: !local ? 'different-source' : matchesRelease ? 'project' : 'modified-project-skill',
    selected: { path: actual, version: selectedVersion }, expected: { path: projectPath, version: projectVersion }, matchesRelease });
};
