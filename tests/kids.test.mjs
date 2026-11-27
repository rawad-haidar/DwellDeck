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
    form(schema, data, callback, labels) { if (labels.rooms) forms.push({data, callback, label: labels.rooms}); return {}; },
    change(config) { this.config = config; }
  };
  const el = () => ({setAttribute() {}, append() {}, style: {}, textContent: ''});
  globalThis.document = {createElement: el, querySelector: () => null};
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

test('the guard sets back what a limited user changes outside their rooms', async () => {
  const {guardAutomation, allowedEntities, GUARDED_DOMAINS} = await import('../src/guard.mjs');
  const h = hass({id: 'a', name: 'Youssef'});
  const allowedAli = allowedEntities(['Ali Room'], h);
  for (const id of ['light.ali_ceiling', 'media_player.ali_tv', 'climate.ali_ac']) assert(allowedAli.includes(id), id);
  assert(!allowedAli.includes('light.saloon'));
  const users = [{id: 'k1', name: 'Ali'}, {id: 'k2', name: 'Sara'}];
  const g = guardAutomation({kids: [{user: 'Ali', rooms: ['ali_room']}, {user: 'k2', rooms: []}, {user: 'Ghost', rooms: ['x']}], protected: ['light.ali_ceiling']}, h, users);
  assert.deepEqual(Object.keys(g.variables.allowed), ['k1', 'k2'], 'names become user ids; unknown users are skipped');
  assert.deepEqual(g.variables.allowed.k2, [], 'no rooms: nothing guarded is theirs');
  assert.deepEqual(g.variables.protected, ['light.ali_ceiling']);
  for (const d of ['switch', 'valve', 'climate', 'water_heater', 'automation', 'lock']) assert(GUARDED_DOMAINS.includes(d), d);
  assert(!GUARDED_DOMAINS.includes('light') && !GUARDED_DOMAINS.includes('media_player'), 'other rooms\' lights and TVs are not guarded unless protected');
  // The condition decides with the real lists: render it the way Home Assistant would.
  const decide = (userId, entityId) => {
    const allowed = g.variables.allowed;
    if (!(userId in allowed)) return false;
    return g.variables.protected.includes(entityId) || (!allowed[userId].includes(entityId) && g.variables.guarded_domains.includes(entityId.split('.')[0]));
  };
  assert.equal(decide('k1', 'switch.boiler'), true);
  assert.equal(decide('k1', 'climate.saloon_ac'), true);
  assert.equal(decide('k1', 'climate.ali_ac'), false, 'their own AC');
  assert.equal(decide('k1', 'light.saloon'), false);
  assert.equal(decide('k1', 'light.ali_ceiling'), true, 'protected even in their room');
  assert.equal(decide('admin', 'switch.boiler'), false, 'other users are never touched');
  assert(g.conditions.every(c => c.value_template.includes('trigger.event')));
});
