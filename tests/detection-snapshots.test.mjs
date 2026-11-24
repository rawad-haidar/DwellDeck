// Detection snapshots: linking detection sensors to cameras, clickable camera tiles
// with snapshot popups, and the automation that saves the snapshots.
import {test} from 'node:test';
import assert from 'node:assert/strict';
globalThis.HTMLElement = class {};
globalThis.customElements = {get: () => undefined, define: () => {}};
globalThis.window = {};
const {detectionSensors, snapshotAutomation, SNAPSHOT_DIR} = await import('../src/detection.mjs');
const {ORIGINAL_TEMPLATE, SLOTS, ROOM_TEMPLATES, generateOriginal} = await import('../dwelldeck.js');

const state = (entity_id, friendly_name, s = 'off', last_changed = '2026-11-24T10:00:00+00:00') =>
  [entity_id, {entity_id, state: s, last_changed, attributes: {friendly_name}}];
const hass = {
  states: Object.fromEntries([
    state('binary_sensor.front_gate_smd_human', 'Front Gate Smart Motion Human', 'on', '2026-11-24T10:05:00+00:00'),
    state('binary_sensor.front_gate_smd_vehicle', 'Front Gate Smart Motion Vehicle', 'off', '2026-11-24T10:04:00+00:00'),
    state('binary_sensor.gym_authorized_vehicle', 'Gym Authorized Vehicle', 'off', '2026-11-24T10:06:00+00:00'),
    state('binary_sensor.garden_human', 'Garden Human', 'unavailable'),
    state('binary_sensor.kitchen_door', 'Kitchen Door'),
    state('camera.front_gate_main', 'Front Gate Main'),
    state('camera.front_gate_sub', 'Front Gate Sub'),
    state('camera.gym', 'Gym'),
    state('camera.lobby', 'Lobby')
  ]),
  entities: {
    'binary_sensor.front_gate_smd_human': {entity_id: 'binary_sensor.front_gate_smd_human', device_id: 'gate'},
    'binary_sensor.front_gate_smd_vehicle': {entity_id: 'binary_sensor.front_gate_smd_vehicle', device_id: 'gate'},
    'camera.front_gate_sub': {entity_id: 'camera.front_gate_sub', device_id: 'gate'},
    'camera.front_gate_main': {entity_id: 'camera.front_gate_main', device_id: 'gate'}
  }
};

test('finds detection sensors by name and links each to its camera', () => {
  assert.deepEqual(detectionSensors(hass).map(({entity_id, kinds, cam, camera}) => ({entity_id, kinds, cam, camera})), [
    {entity_id: 'binary_sensor.front_gate_smd_human', kinds: ['human'], cam: 'Front Gate', camera: 'camera.front_gate_main'},
    {entity_id: 'binary_sensor.front_gate_smd_vehicle', kinds: ['vehicle'], cam: 'Front Gate', camera: 'camera.front_gate_main'},
    {entity_id: 'binary_sensor.garden_human', kinds: ['human'], cam: 'Garden', camera: null},
    {entity_id: 'binary_sensor.gym_authorized_vehicle', kinds: ['vehicle'], cam: 'Gym', camera: 'camera.gym'}
  ]);
});

test('a sensor named for both human and vehicle counts as both', () => {
  const both = {states: Object.fromEntries([state('binary_sensor.drive', 'Driveway Human Vehicle Detection')])};
  assert.deepEqual(detectionSensors(both)[0].kinds, ['human', 'vehicle']);
  assert.equal(detectionSensors(both)[0].cam, 'Driveway');
});

test('the snapshot automation saves one picture per sensor from its camera', () => {
  const automation = snapshotAutomation(detectionSensors(hass));
  assert.equal(automation.mode, 'parallel');
  assert.deepEqual(automation.triggers, [
    {trigger: 'state', entity_id: ['binary_sensor.front_gate_smd_human', 'binary_sensor.front_gate_smd_vehicle'], to: 'on', id: 'camera.front_gate_main'},
    {trigger: 'state', entity_id: ['binary_sensor.gym_authorized_vehicle'], to: 'on', id: 'camera.gym'}
  ]);
  assert.deepEqual(automation.actions, [{action: 'camera.snapshot', target: {entity_id: '{{ trigger.id }}'},
    data: {filename: `${SNAPSHOT_DIR}/{{ trigger.entity_id }}.jpg`}}]);
  assert(SNAPSHOT_DIR.startsWith('/media/'), 'snapshots must stay in the login-protected media folder');
});

const generate = config => generateOriginal(ORIGINAL_TEMPLATE, SLOTS, ROOM_TEMPLATES, {dashboard_path: '/dashboard-test', ...config}, hass);
// One folding card lists every camera; each entry keeps its detection popup.
const panel = d => d.views.find(v => v.path === 'security').sections
  .find(s => s.cards.some(c => c.heading === 'Camera detection')).cards.find(c => c.type === 'custom:button-card');
const tiles = d => panel(d).variables.dwell_groups;

test('each camera is listed with its detection popup, newest detection first, folded by default', () => {
  const card = panel(generate({}));
  const groups = tiles(generate({}));
  assert.deepEqual(groups.map(g => g.cam), ['Front Gate', 'Gym', 'Garden']);
  assert.deepEqual(card.triggers_update.slice(0, 2), ['binary_sensor.front_gate_smd_human', 'binary_sensor.front_gate_smd_vehicle']);
  assert.equal(groups[0].popup.service, 'browser_mod.popup');
  globalThis.window = {};
  const render = states => Function('states', card.custom_fields.list.trim().slice(3, -3))(states);
  const html = render(hass.states);
  assert(!html.includes('class="det open"'), 'folded by default');
  assert(html.indexOf('Front Gate') < html.indexOf('>Gym<') && html.indexOf('>Gym<') < html.indexOf('>Garden<'));
  // Order is live: when Gym detects later, Gym comes first.
  const later = {...hass.states, 'binary_sensor.front_gate_smd_human': {...hass.states['binary_sensor.front_gate_smd_human'], state: 'off'},
    'binary_sensor.gym_authorized_vehicle': {...hass.states['binary_sensor.gym_authorized_vehicle'], state: 'on', last_changed: '2026-11-24T11:00:00+00:00'}};
  const again = render(later);
  assert(again.indexOf('>Gym<') < again.indexOf('>Front Gate<'));
  assert(html.includes('/media-browser/browser/'), 'link to all snapshots');
  assert(window.__dwellDet.g0.service === 'browser_mod.popup');
});

test('with snapshots on, the popup shows each sensor snapshot and the live camera', () => {
  const content = JSON.stringify(tiles(generate({detection_snapshots: true}))[0].popup.data.content);
  assert(content.includes('"image":"media-source://media_source/local/dwelldeck/snapshots/binary_sensor.front_gate_smd_human.jpg"'));
  assert(content.includes('"image":"media-source://media_source/local/dwelldeck/snapshots/binary_sensor.front_gate_smd_vehicle.jpg"'));
  assert(content.includes('"entity":"camera.front_gate_main"'));
});

test('with snapshots off, the popup shows the live camera and explains how to turn snapshots on', () => {
  const content = JSON.stringify(tiles(generate({}))[0].popup.data.content);
  assert(!content.includes('media-source://'));
  assert(content.includes('"entity":"camera.front_gate_main"'));
  assert(content.includes('Set up detection snapshots'));
});

test('without detection sensors the recent activity table remains', () => {
  const d = generateOriginal(ORIGINAL_TEMPLATE, SLOTS, ROOM_TEMPLATES, {dashboard_path: '/dashboard-test'}, {});
  const section = d.views.find(v => v.path === 'security').sections.find(s => s.cards.some(c => c.heading === 'Camera detection'));
  assert(section.cards.some(c => c.type === 'markdown' && c.content.includes('| Camera |')));
});
