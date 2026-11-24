// The distributable must expose the same API and output as the src/ modules it is built from.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

globalThis.HTMLElement = class {};
const registered = new Map();
globalThis.customElements = {get: k => registered.get(k), define: (k, v) => registered.set(k, v)};
globalThis.window = {};
const bundle = await import('../dwelldeck.js');
const source = await import('../src/index.mjs');

test('bundle exports exactly the public API', () => {
  assert.deepEqual(Object.keys(bundle).sort(), [
    'BUILTIN_THEME', 'DEPENDENCIES', 'LABELS', 'ORIGINAL_TEMPLATE', 'ROOM_TEMPLATES', 'SLOTS',
    'dependencyStatus', 'discoverConfiguration', 'discoveryContext', 'generateOriginal',
    'inferDashboardPath', 'roomControlEntities', 'roomEntities'
  ]);
  assert.deepEqual(Object.keys(source).sort(), Object.keys(bundle).sort());
});

test('bundle and src generate identical dashboards', () => {
  const config = {dashboard_path: '/dashboard-test', color_palette: 'emerald', extra_rooms: [{name: 'Patio', entities: ['light.patio']}]};
  const generate = api => JSON.stringify(api.generateOriginal(api.ORIGINAL_TEMPLATE, api.SLOTS, api.ROOM_TEMPLATES, config));
  assert.equal(generate(bundle), generate(source));
});

test('bundle is self-contained', async () => {
  const fs = await import('node:fs/promises');
  const text = await fs.readFile(new URL('../dwelldeck.js', import.meta.url), 'utf8');
  assert(!/^import /m.test(text), 'HACS serves a single file, so the bundle cannot import modules');
});

test('dwelldeck.js is up to date with src/', () => {
  execFileSync(process.execPath, [new URL('../scripts/build.mjs', import.meta.url).pathname, '--check'], {stdio: 'pipe'});
});
