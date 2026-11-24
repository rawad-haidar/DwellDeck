// Golden tests: lock the exact generated dashboards so refactors cannot change behaviour.
// Regenerate deliberately with: UPDATE_GOLDEN=1 npm test
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';

globalThis.HTMLElement = class {};
const registered = new Map();
globalThis.customElements = {get: k => registered.get(k), define: (k, v) => registered.set(k, v)};
globalThis.window = {};
const {ORIGINAL_TEMPLATE, SLOTS, ROOM_TEMPLATES, generateOriginal, discoverConfiguration} = await import('../dwelldeck.js');

const goldenFile = new URL('./golden.json', import.meta.url);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

const entity = (entity_id, extra = {}) => ({entity_id, ...extra});
const registry = [
  entity('light.living_ceiling', {area_id: 'living'}),
  entity('light.living_lamp', {device_id: 'lamp'}),
  entity('switch.living_strip', {area_id: 'living'}),
  entity('switch.living_socket', {area_id: 'living'}),
  entity('cover.living_curtain', {area_id: 'living'}),
  entity('climate.living_ac', {area_id: 'living'}),
  entity('sensor.living_temperature', {area_id: 'living'}),
  entity('binary_sensor.living_motion', {area_id: 'living', labels: ['security']}),
  entity('scene.living_movie', {area_id: 'living'}),
  entity('media_player.living_tv', {area_id: 'living'}),
  entity('light.kitchen_main', {area_id: 'kitchen'}),
  entity('switch.kitchen_reboot', {area_id: 'kitchen', platform: 'unifi'}),
  entity('camera.kitchen_cam', {area_id: 'kitchen'}),
  entity('switch.kitchen_cam_privacy', {area_id: 'kitchen', device_id: 'cam'}),
  entity('light.kitchen_hidden', {area_id: 'kitchen', hidden_by: 'user'}),
  entity('light.garden_path', {area_id: 'garden'}),
  entity('switch.garden_pump', {area_id: 'garden'}),
  entity('sensor.garden_humidity', {area_id: 'garden'}),
  entity('lock.front_door', {area_id: 'garden'}),
  entity('alarm_control_panel.house', {area_id: 'garden', name: 'Alarm'}),
  entity('weather.home', {}),
  entity('sensor.energy_today', {entity_category: 'diagnostic'})
];
const states = Object.fromEntries(registry.map(e => [e.entity_id, {
  entity_id: e.entity_id,
  state: e.entity_id.startsWith('light.') ? 'on' : 'off',
  attributes: {
    friendly_name: e.entity_id.split('.')[1].replaceAll('_', ' '),
    ...(e.entity_id === 'switch.living_socket' ? {device_class: 'outlet'} : {}),
    ...(e.entity_id === 'sensor.living_temperature' ? {device_class: 'temperature', unit_of_measurement: '°C'} : {}),
    ...(e.entity_id === 'sensor.garden_humidity' ? {device_class: 'humidity'} : {})
  }
}]));
const hass = {
  states,
  services: {browser_mod: {popup: {}}},
  areas: {
    living: {area_id: 'living', name: 'Living room', floor_id: 'ground', labels: []},
    kitchen: {area_id: 'kitchen', name: 'Kitchen', floor_id: 'ground', labels: []},
    garden: {area_id: 'garden', name: 'Garden', floor_id: 'outside', labels: ['outdoor']}
  },
  floors: {ground: {floor_id: 'ground', name: 'Ground floor', level: 0}, outside: {floor_id: 'outside', name: 'Outside', level: 1}},
  labels: {security: {label_id: 'security', name: 'Security'}, outdoor: {label_id: 'outdoor', name: 'Outdoor'}},
  devices: {lamp: {id: 'lamp', area_id: 'living'}, cam: {id: 'cam', area_id: 'kitchen'}},
  entities: Object.fromEntries(registry.map(e => [e.entity_id, e]))
};

const base = {dashboard_path: '/dashboard-test'};
const room = ROOM_TEMPLATES[0];
const lightSlot = SLOTS.find(s => s.domain === 'light');
const cases = {
  default: [base],
  'title, theme and music app': [{...base, title: 'Villa', theme: 'Existing theme', music_app: 'music-assistant'}],
  ...Object.fromEntries(['lamplight', 'ocean', 'emerald', 'violet', 'rose', 'slate', 'unknown'].map(p => [`palette ${p}`, [{...base, color_palette: p}]])),
  'entity binding': [{...base, entities: {[lightSlot.key]: 'light.living_ceiling'}}],
  'labels': [{...base, labels: {__DWELLDECK_LABEL_01__: 'Master suite'}}],
  'template room by entities': [{...base, rooms: {[room.key]: {name: 'My living room', entities: ['light.a', 'light.b']}}}],
  'template room by area with controls': [{...base, room_controls: true, rooms: {[room.key]: {area: 'living', discover_controls: true, exclude: ['switch.living_strip']}}}, hass],
  'extra rooms': [{...base, extra_rooms: [{name: 'Patio', entities: ['light.patio']}, {area: 'garden'}]}, hass],
  'area rooms': [{...base, area_rooms: true, room_controls: true, rooms: {
    living: {name: 'Living room', area: 'living', discover_controls: true, discover_lighting: true},
    kitchen: {name: 'Kitchen', area: 'kitchen', discover_controls: true, discover_lighting: true},
    garden: {name: 'Garden', area: 'garden', discover_controls: false, controls: ['lock.front_door']}
  }}, hass],
  'auto discover': [{...base, auto_discover: true}, hass],
  'system font': [{...base, font: 'system'}],
  'auto discover keeps bindings': [{...base, auto_discover: true, entities: {[lightSlot.key]: 'light.kitchen_main'}, color_palette: 'emerald'}, hass]
};

const actual = {};
for (const [name, [config, context]] of Object.entries(cases)) {
  const before = JSON.stringify(config);
  actual[name] = hash(generateOriginal(ORIGINAL_TEMPLATE, SLOTS, ROOM_TEMPLATES, config, context));
  assert.equal(JSON.stringify(config), before, `${name}: config was mutated`);
}
// The src/ modules run without the bundle's shared scope, so they catch missing imports.
const source = await import('../src/index.mjs');
const sourceHashes = {};
for (const [name, [config, context]] of Object.entries(cases)) {
  try {
    sourceHashes[name] = hash(source.generateOriginal(source.ORIGINAL_TEMPLATE, source.SLOTS, source.ROOM_TEMPLATES, config, context));
  } catch (error) {
    sourceHashes[name] = `${error.name}: ${error.message}`;
  }
}
actual['discoverConfiguration'] = hash(discoverConfiguration({...base, rooms: {x: {area: 'living', discover_controls: false}}}, hass));
const strategy = registered.get('ll-strategy-dashboard-dwelldeck-original');
const callWS = async ({type}) => ({
  'config/area_registry/list': Object.values(hass.areas),
  'config/entity_registry/list': Object.values(hass.entities),
  'config/device_registry/list': Object.values(hass.devices),
  'config/floor_registry/list': Object.values(hass.floors),
  'config/label_registry/list': Object.values(hass.labels)
})[type];
actual['strategy generate with discovery'] = hash(await strategy.generate({...base, auto_discover: true}, {states, services: hass.services, callWS}));

if (process.env.UPDATE_GOLDEN) fs.writeFileSync(goldenFile, JSON.stringify(actual, null, 2) + '\n');
const golden = JSON.parse(fs.readFileSync(goldenFile, 'utf8'));

for (const name of Object.keys(actual)) {
  test(`golden: ${name}`, () => assert.equal(actual[name], golden[name], 'generated dashboard changed'));
}
for (const name of Object.keys(sourceHashes)) {
  test(`golden (src): ${name}`, () => assert.equal(sourceHashes[name], golden[name], 'src/ output differs from the bundle'));
}
test('golden: no stale cases', () => assert.deepEqual(Object.keys(golden).sort(), Object.keys(actual).sort()));
