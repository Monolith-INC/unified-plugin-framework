// The archive carries the Markdown reachable from its public entry points.
import { copyFile, mkdir, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const localLinks = (markdown) => [...markdown.matchAll(/\]\((?:<([^>]+)>|([^\s)]+))(?:\s+"[^"]*")?\)/gu)]
  .map((match) => (match[1] ?? match[2]).split('#')[0])
  .filter((link) => link && !/^(?:[a-z][a-z\d+.\-]*:|\/\/)/iu.test(link)).map(decodeURIComponent);
const confined = (root, path) => {
  const name = relative(root, path);
  if (!name || isAbsolute(name) || name === '..' || name.startsWith('..' + sep)) throw new Error(`Document link leaves the archive: ${name}`);
  return name;
};

const visit = async (root, pending, seen) => {
  const [name, ...rest] = pending;
  if (name === undefined) return seen;
  if (seen.includes(name)) return visit(root, rest, seen);
  const path = join(root, name);
  const actual = await realpath(path);
  if (actual !== path) throw new Error(`Release documentation links through a symbolic link: ${name}`);
  const links = name.endsWith('.md') ? localLinks(await readFile(path, 'utf8'))
    .map((link) => confined(root, resolve(dirname(path), link))) : [];
  return visit(root, [...rest, ...links], [...seen, name]);
};

export const releaseDocuments = async (root) => visit(await realpath(root), ['README.md', 'CHANGELOG.md'], []);
export const copyReleaseDocuments = async (repository, destination) => {
  const paths = await releaseDocuments(repository);
  // Non-Markdown targets (such as licenses and the dependency lock) ship with the distribution itself.
  await Promise.all(paths.filter((name) => name.endsWith('.md')).map(async (name) => {
    const target = join(destination, name);
    await mkdir(dirname(target), { recursive: true });
    return copyFile(join(repository, name), target);
  }));
  return releaseDocuments(destination);
};
