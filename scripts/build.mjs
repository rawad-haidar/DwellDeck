// Builds the single-file HACS distributable dwelldeck.js from src/.
// Usage: node scripts/build.mjs          write dwelldeck.js
//        node scripts/build.mjs --check  fail if dwelldeck.js is out of date
//
// The src/ modules share one scope once bundled, so top-level names must be
// unique across modules. Only names re-exported by src/index.mjs stay exported.
import fs from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => fs.readFile(new URL(path, root), 'utf8');

// Dependency order: each module only uses modules listed before it.
const MODULES = ['util', 'dependencies', 'discovery', 'theme', 'weather', 'design', 'tv', 'rooms', 'home', 'security', 'energy', 'climate', 'music', 'cards', 'views', 'detection', 'generator', 'kids', 'editor', 'strategy'];
const DATA = {
  ORIGINAL_TEMPLATE: 'template', SLOTS: 'slots', ROOM_TEMPLATES: 'room-templates',
  LABELS: 'labels', BUILTIN_THEME: 'builtin-theme'
};
const localImport = /^import \{[^}]*\} from '\.\/[\w-]+\.mjs';\n/gm;

export async function build() {
  const {version} = JSON.parse(await read('package.json'));
  const index = await read('src/index.mjs');
  const publicNames = new Set([...index.matchAll(/^export \{([^}]*)\}/gm)].flatMap(m => m[1].split(',').map(s => s.trim())));
  const parts = [`// DwellDeck ${version} — original design edition. MIT License.`, `const DWELLDECK_VERSION = ${JSON.stringify(version)};`];
  for (const [name, file] of Object.entries(DATA)) {
    parts.push(`export const ${name} = ${JSON.stringify(JSON.parse(await read(`src/data/${file}.json`)))};`);
  }
  for (const module of MODULES) {
    const source = (await read(`src/${module}.mjs`)).replace(localImport, '').replace(/^\n+/, '\n');
    if (/^import /m.test(source)) throw Error(`src/${module}.mjs: only single-line local imports can be bundled`);
    parts.push(source.replace(/^export ((?:async )?(?:function|const|let|class) ([\w$]+))/gm,
      (match, declaration, name) => publicNames.has(name) ? match : declaration).trimEnd());
  }
  return parts.join('\n') + '\n';
}

const output = await build();
const target = new URL('dwelldeck.js', root);
if (process.argv.includes('--check')) {
  const current = await fs.readFile(target, 'utf8').catch(() => '');
  if (current !== output) {
    console.error('dwelldeck.js is out of date with src/. Run `npm run build` and commit the result.');
    process.exit(1);
  }
  console.log('dwelldeck.js is up to date');
} else {
  await fs.writeFile(target, output);
  console.log('Built dwelldeck.js from src/');
}
