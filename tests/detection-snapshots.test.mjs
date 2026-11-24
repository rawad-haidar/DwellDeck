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
  assert.deepEqual(automation.actions, [
    {action: 'camera.snapshot', target: {entity_id: '{{ trigger.id }}'}, data: {filename: `${SNAPSHOT_DIR}/{{ trigger.entity_id }}.jpg`}},
    {action: 'camera.snapshot', target: {entity_id: '{{ trigger.id }}'},
      data: {filename: `${SNAPSHOT_DIR}/{{ trigger.id.split('.')[1] }}/{{ now().strftime('%Y%m%d_%H%M%S') }}_{{ trigger.entity_id.split('.')[1] }}.jpg`}}]);
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
  assert(content.includes('media-source://media_source/local/dwelldeck/snapshots/front_gate_main'), 'the camera folder');
  assert(content.includes('media-source://media_source/local/dwelldeck/snapshots/binary_sensor.front_gate_smd_human.jpg'), 'latest per sensor until dated ones exist');
  assert(content.includes('media-source://media_source/local/dwelldeck/snapshots/binary_sensor.front_gate_smd_vehicle.jpg'));
  assert(content.includes('pointer-events'));
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
test('the snapshots link opens the snapshot folder in the Media browser', async () => {
  const {SNAPSHOT_BROWSER} = await import('../src/detection.mjs');
  assert.equal(SNAPSHOT_BROWSER, '/media-browser/browser/app%2Cmedia-source%3A%2F%2Fmedia_source/%2Cmedia-source%3A%2F%2Fmedia_source%2Flocal%2Fdwelldeck%2Fsnapshots');
});

test('the snapshot viewer lists the camera folder newest first and switches the large picture', async () => {
  const content = tiles(generate({detection_snapshots: true}))[0].popup.data.content;
  const viewer = content.cards[0];
  const body = viewer.custom_fields.viewer.trim().slice(3, -3);
  const files = ['20261124_101500_front_gate_smd_vehicle.jpg', '20261124_203724_front_gate_smd_human.jpg', '20261123_090000_front_gate_smd_human.jpg'];
  const hass = {callWS: async msg => msg.type === 'media_source/browse_media'
    ? {children: files.map(title => ({title, media_content_id: msg.media_content_id + '/' + title, can_expand: false}))}
    : {url: '/media/' + msg.media_content_id.split('/').pop()}};
  globalThis.window = {};
  const run = card => Function('states', 'hass', body).call(card, {}, hass);
  assert.match(run(null), /Loading snapshots/);
  await new Promise(resolve => setTimeout(resolve, 20));
  const html = run(null);
  const order = [...html.matchAll(/<img src="\/media\/([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(order, ['20261124_203724_front_gate_smd_human.jpg', '20261124_101500_front_gate_smd_vehicle.jpg', '20261123_090000_front_gate_smd_human.jpg']);
  assert(html.includes('class="big" src="/media/20261124_203724_front_gate_smd_human.jpg"'));
  assert(html.includes('__dwellSnapUi.pick'));
});

test('before dated snapshots exist, the viewer shows only sensors that have a latest snapshot', async () => {
  const viewer = tiles(generate({detection_snapshots: true}))[0].popup.data.content.cards[0];
  const body = viewer.custom_fields.viewer.trim().slice(3, -3);
  const root = 'media-source://media_source/local/dwelldeck/snapshots';
  const hass = {callWS: async msg => {
    if (msg.type === 'media_source/browse_media' && msg.media_content_id === root) return {children: [{media_content_id: root + '/binary_sensor.front_gate_smd_human.jpg', title: 'binary_sensor.front_gate_smd_human.jpg'}]};
    if (msg.type === 'media_source/browse_media') throw {code: 'browse_media_failed'};
    return {url: '/media/' + msg.media_content_id.split('/').pop()};
  }};
  globalThis.window = {};
  const run = () => Function('states', 'hass', body).call(null, {}, hass);
  run();
  await new Promise(resolve => setTimeout(resolve, 20));
  const html = run();
  assert(html.includes('binary_sensor.front_gate_smd_human.jpg'));
  assert(!html.includes('binary_sensor.front_gate_smd_vehicle.jpg'), 'no empty picture for a sensor without a snapshot');
});
test('snapshots are kept 30 days: the strip shows the last 30 days and a nightly cleanup deletes older dated ones', async () => {
  const {CLEANUP_COMMAND, CLEANUP_YAML, cleanupAutomation, SNAPSHOT_DAYS} = await import('../src/detection.mjs');
  assert.equal(SNAPSHOT_DAYS, 30);
  assert.equal(CLEANUP_COMMAND, "find /media/dwelldeck/snapshots -mindepth 2 -type f -name '*.jpg' -mmin +43200 -delete");
  assert(CLEANUP_YAML.includes('dwelldeck_snapshot_cleanup:'));
  assert.deepEqual(cleanupAutomation().actions, [{action: 'shell_command.dwelldeck_snapshot_cleanup'}]);
  const viewer = tiles(generate({detection_snapshots: true}))[0].popup.data.content.cards[0];
  const body = viewer.custom_fields.viewer.trim().slice(3, -3);
  const stamp = d => d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '_120000';
  const day = n => new Date(Date.now() - n * 86400000);
  const files = [...Array(45).keys()].map(n => `${stamp(day(n))}_front_gate_smd_human.jpg`);
  const hass = {callWS: async msg => msg.type === 'media_source/browse_media'
    ? {children: files.map(title => ({title, media_content_id: msg.media_content_id + '/' + title, can_expand: false}))}
    : {url: '/media/' + msg.media_content_id.split('/').pop()}};
  globalThis.window = {};
  const run = () => Function('states', 'hass', body).call(null, {}, hass);
  run();
  await new Promise(resolve => setTimeout(resolve, 50));
  const thumbs = run().match(/class="th/g).length;
  assert(thumbs >= 29 && thumbs <= 31, `about 30 days shown, got ${thumbs}`);
});
