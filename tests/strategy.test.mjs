// The dashboard strategy must still generate when a registry cannot be read (for example
// older Home Assistant without floors or labels), unless a feature the user turned on needs them.
import {test} from 'node:test';
import assert from 'node:assert/strict';
globalThis.HTMLElement = class {};
const registered = new Map();
globalThis.customElements = {get: k => registered.get(k), define: (k, v) => registered.set(k, v)};
globalThis.window = {};
await import('../dwelldeck.js');
const strategy = registered.get('ll-strategy-dashboard-dwelldeck-original');

const states = Object.fromEntries([
  ['binary_sensor.front_gate_smd_human', 'Front Gate Smart Motion Human'],
  ['camera.front_gate_main', 'Front Gate Main']
].map(([entity_id, friendly_name]) => [entity_id, {entity_id, state: 'off', last_changed: '2026-11-24T10:00:00+00:00', attributes: {friendly_name}}]));
const denied = {states, callWS: async () => { throw {code: 'unauthorized', message: 'Unauthorized'}; }};

test('camera detection falls back to name matching when the registries cannot be read', async () => {
  const dashboard = await strategy.generate({dashboard_path: '/dashboard-test', detection_snapshots: true}, denied);
  const section = dashboard.views.find(v => v.path === 'security').sections.find(s => s.cards.some(c => c.heading === 'Camera detection'));
  const tile = section.cards.find(c => c.type === 'custom:button-card');
  assert.equal(tile.name, 'Front Gate');
  assert(JSON.stringify(tile.tap_action).includes('"entity":"camera.front_gate_main"'));
});

test('features that need the registries still report the failure', async () => {
  await assert.rejects(strategy.generate({dashboard_path: '/dashboard-test', auto_discover: true}, denied));
});
