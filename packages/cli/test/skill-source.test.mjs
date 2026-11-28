import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { run } from '../dist/index.js';
import { installSkills } from '../dist/tooling-runtime.js';

test('skill-source identifies the file opened by the host even when project and cached skill names match', async () => {
  const project = await mkdtemp(join(tmpdir(), 'upf-source-'));
  assert.equal((await installSkills(project, 'codex')).ok, true);
  const opened = join(project, '.agents/skills/discover-quick/SKILL.md');
  const inspect = async (path) => {
    const output = [];
    await run(['project', 'skill-source', 'codex', path], { cwd: () => project, out: (line) => output.push(line) });
    return JSON.parse(output[0]);
  };
  const projectResult = await inspect(opened);
  assert.equal(projectResult.value.status, 'project');
  assert.equal(projectResult.value.matchesRelease, true);
  const cache = join(project, 'cache/unified-plugin-framework/0.1.0');
  const cached = join(cache, 'skills/discover-quick/SKILL.md');
  await mkdir(join(cache, '.codex-plugin'), { recursive: true });
  await cp(join(project, '.agents/skills/discover-quick'), join(cache, 'skills/discover-quick'), { recursive: true });
  await writeFile(join(cache, '.codex-plugin/plugin.json'), JSON.stringify({ name: 'unified-plugin-framework', version: '0.1.0' }));
  assert.equal((await inspect(cached)).value.status, 'different-source', 'matching bytes do not prove the host selected the project file');
  await writeFile(cached, '# Earlier instructions');
  const stale = (await inspect(cached)).value;
  assert.deepEqual(stale.selected, { path: cached, version: '0.1.0' });
  assert.deepEqual(stale.expected, projectResult.value.expected);
  assert.equal(stale.matchesRelease, false);
  await writeFile(opened, '# Edited locally');
  assert.equal((await inspect(opened)).value.status, 'modified-project-skill');
  assert.equal((await inspect('SKILL.md')).ok, false);
});
