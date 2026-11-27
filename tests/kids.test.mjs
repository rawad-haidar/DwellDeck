import {test} from 'node:test';
import assert from 'node:assert/strict';
globalThis.HTMLElement = class {};
const registered = new Map();
globalThis.customElements = {get: k => registered.get(k), define: (k, v) => registered.set(k, v)};
globalThis.window = {};
await import('../dwelldeck.js');
const Strategy = registered.get('ll-strategy-dashboard-dwelldeck-original');

const st = (state, attributes = {}) => ({state, attributes});
const states = {
  'light.ali_ceiling': st('off', {friendly_name: 'Ali Ceiling'}),
  'switch.ali_lamp': st('off', {friendly_name: 'Ali Lamp'}),
  'media_player.ali_tv': st('off', {friendly_name: 'Ali TV', device_class: 'tv'}),
  'climate.ali_ac': st('off', {friendly_name: 'Ali AC', hvac_modes: ['off', 'cool'], supported_features: 1}),
  'camera.ali_cam': st('idle'),
  'binary_sensor.ali_window': st('off', {device_class: 'window'}),
  'light.saloon': st('on', {friendly_name: 'Saloon'}),
  'alarm_control_panel.house': st('disarmed', {supported_features: 3}),
  'lock.gate': st('locked')
};
const E = (entity_id, area_id) => ({entity_id, area_id, platform: 'x'});
const hass = user => ({
  user, states,
  services: {browser_mod: {popup: {}}},
  areas: {ali_room: {area_id: 'ali_room', name: 'Ali Room', icon: 'mdi:bed'}, saloon: {area_id: 'saloon', name: 'Saloon'}},
  floors: {}, labels: {}, devices: {},
  entities: Object.fromEntries(Object.keys(states).map(id => [id, E(id, id.includes('ali') ? 'ali_room' : 'saloon')]))
});
const config = {type: 'custom:dwelldeck-original', dashboard_path: '/dashboard-test', kids: [{user: 'Ali', rooms: ['Ali Room']}]};

test('a kid sees only their own room: lights, TV and air conditioning', async () => {
  const d = await Strategy.generate(config, hass({id: 'u1', name: 'ali'}));
  assert.equal(d.views.length, 1);
  assert.equal(d.views[0].path, 'my-room');
  const text = JSON.stringify(d);
  for (const id of ['light.ali_ceiling', 'media_player.ali_tv', 'climate.ali_ac']) assert(text.includes(id), id);
  for (const id of ['light.saloon', 'alarm_control_panel.house', 'lock.gate', 'camera.ali_cam', 'binary_sensor.ali_window']) assert(!text.includes(id), id);
  assert(!text.includes('"more-info"'), 'no more-info dialogs, which open history and related entities');
});

test('a kid can be matched by user id, and everyone else gets the full dashboard', async () => {
  const byId = await Strategy.generate({...config, kids: [{user: 'u1', rooms: ['ali_room']}]}, hass({id: 'u1', name: 'Someone'}));
  assert.equal(byId.views[0].path, 'my-room');
  const parent = await Strategy.generate(config, hass({id: 'u2', name: 'Youssef'}));
  assert(parent.views.length > 5 && parent.views.some(v => v.path === 'security'));
});

test('a kid with no room set up gets a clear message, not other rooms', async () => {
  const d = await Strategy.generate({...config, kids: [{user: 'Ali', rooms: ['nowhere']}]}, hass({id: 'u1', name: 'Ali'}));
  assert.equal(d.views.length, 1);
  assert(JSON.stringify(d).includes('No rooms are set up for you yet'));
  assert(!JSON.stringify(d).includes('light.saloon'));
});

test('the editor lists non-admin users and saves the rooms picked for each', async () => {
  const {DwellDeckOriginalEditor} = await import('../src/editor.mjs');
  const forms = [];
  const editor = {
    config: {type: 'custom:dwelldeck-original', kids: [{user: 'Ali', rooms: ['old_room']}]},
    _hass: {callWS: async () => [
      {id: 'a1', name: 'Youssef', group_ids: ['system-admin']},
      {id: 'k1', name: 'Ali', group_ids: ['system-users']},
      {id: 'k2', name: 'Sara', group_ids: ['system-users']},
      {id: 's1', name: 'Supervisor', system_generated: true, group_ids: ['system-users']}
    ]},
    form(schema, data, callback, labels) { forms.push({data, callback, label: labels.rooms}); return {}; },
    change(config) { this.config = config; }
  };
  const container = {replaceChildren() {}, append() {}, textContent: ''};
  await DwellDeckOriginalEditor.prototype.renderLimitedUsers.call(editor, container);
  assert.deepEqual(forms.map(f => f.label), ['Ali: rooms they can use', 'Sara: rooms they can use'], 'admins and system users are not listed');
  assert.deepEqual(forms[0].data.rooms, ['old_room'], 'an entry written by name is found');
  forms[0].callback({rooms: ['ali_room']});
  forms[1].callback({rooms: ['sara_room']});
  assert.deepEqual(editor.config.kids, [{user: 'k1', name: 'Ali', rooms: ['ali_room']}, {user: 'k2', name: 'Sara', rooms: ['sara_room']}]);
  forms[0].callback({rooms: []});
  assert.deepEqual(editor.config.kids, [{user: 'k2', name: 'Sara', rooms: ['sara_room']}], 'emptying the rooms gives the full dashboard back');
  forms[1].callback({rooms: []});
  assert.equal(editor.config.kids, undefined);
});
