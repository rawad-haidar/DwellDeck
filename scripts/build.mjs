// Builds the single-file HACS distributable dwelldeck.js from src/.
// Usage: node scripts/build.mjs          write dwelldeck.js
//        node scripts/build.mjs --check  fail if dwelldeck.js is out of date
import fs from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => fs.readFile(new URL(path, root), 'utf8');

const DATA = {
  ORIGINAL_TEMPLATE: 'src/data/template.json',
  SLOTS: 'src/data/slots.json',
  ROOM_TEMPLATES: 'src/data/room-templates.json',
  LABELS: 'src/data/labels.json',
  BUILTIN_THEME: 'src/data/builtin-theme.json'
};

export async function build() {
  const {version} = JSON.parse(await read('package.json'));
  const parts = [`// DwellDeck ${version} — original design edition. MIT License.`];
  for (const [name, path] of Object.entries(DATA)) {
    parts.push(`export const ${name} = ${JSON.stringify(JSON.parse(await read(path)))};`);
  }
  parts.push(await read('original-layout-core.mjs'));
  return parts.join('\n');
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
