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
  'media_player.saloon_tv': st('playing', {friendly_name: 'Saloon TV', device_class: 'tv'}),
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
const config = {type: 'custom:dwelldeck-original', dashboard_path: '/dashboard-test', auto_discover: true, kids: [{user: 'Ali', tabs: ['rooms'], rooms: ['Ali Room']}]};
const paths = d => d.views.filter(v => !v.subview).map(v => v.path);
const roomNames = d => [...JSON.stringify(d.views.find(v => v.path === 'rooms') || {}).matchAll(/"name":"(Ali Room|Saloon)"/g)].map(m => m[1]);


test('with the Rooms tab, a limited user sees only the rooms picked for them', async () => {
  const d = await Strategy.generate(config, hass({id: 'u1', name: 'ali'}));
  assert.deepEqual(paths(d), ['rooms']);
  const names = new Set(roomNames(d));
  assert(names.has('Ali Room') && !names.has('Saloon'), [...names].join());
  const text = JSON.stringify(d);
  assert(text.includes('light.ali_ceiling') && !text.includes('light.saloon'));
  const parent = await Strategy.generate(config, hass({id: 'u2', name: 'Youssef'}));
  assert(parent.views.some(v => v.path === 'security') && new Set(roomNames(parent)).has('Saloon'), 'everyone else gets the full dashboard');
});

test('an entry from before tabs (rooms only) means the Rooms tab with those rooms; matched by id too', async () => {
  const d = await Strategy.generate({...config, kids: [{user: 'u1', rooms: ['ali_room']}]}, hass({id: 'u1', name: 'Someone'}));
  assert.deepEqual(paths(d), ['rooms']);
  assert.deepEqual([...new Set(roomNames(d))], ['Ali Room']);
});

test('each tab shows only what was picked for it; tabs left open show everything on them', async () => {
  const kid = {user: 'Ali', tabs: ['media', 'home'], access: {home: {area_id: ['ali_room']}}};
  const d = await Strategy.generate({...config, kids: [kid]}, hass({id: 'u1', name: 'Ali'}));
  assert.deepEqual(paths(d), ['home', 'media'], 'in the dashboard\'s own order');
  for (const p of ['devices', 'popup-library', 'security-sensors', 'cameras', 'rooms', 'security']) assert(!d.views.some(v => v.path === p), p);
  const sub = d.views.filter(v => v.subview).map(v => v.path);
  assert(sub.every(p => JSON.stringify(d.views.filter(v => !v.subview)).includes(`/${p}"`)), 'only subviews a picked tab opens');
  const home = JSON.stringify(d.views.find(v => v.path === 'home'));
  for (const id of ['light.saloon', 'alarm_control_panel.house', 'lock.gate']) assert(!home.includes(id), `Home shows only Ali Room: ${id}`);
  const full = await Strategy.generate({...config, kids: [{user: 'Ali', tabs: ['home']}]}, hass({id: 'u1', name: 'Ali'}));
  assert(JSON.stringify(full.views.find(v => v.path === 'home')).includes('light.saloon'), 'nothing picked: the whole tab');
  const media = await Strategy.generate({...config, kids: [{user: 'Ali', tabs: ['media'], access: {media: {entity_id: ['media_player.ali_tv']}}}]}, hass({id: 'u1', name: 'Ali'}));
  const mediaText = JSON.stringify(media.views.find(v => v.path === 'media'));
  assert(mediaText.includes('media_player.ali_tv') && !mediaText.includes('media_player.saloon_tv'), 'Media shows only the picked player');
  const all = await Strategy.generate({...config, kids: [{user: 'Ali', tabs: ['media']}]}, hass({id: 'u1', name: 'Ali'}));
  assert(JSON.stringify(all.views.find(v => v.path === 'media')).includes('media_player.saloon_tv'), 'the fixture does show the other TV when nothing is picked');
});

test('a limited user with no tabs gets a clear message, not the dashboard', async () => {
  const d = await Strategy.generate({...config, kids: [{user: 'Ali', tabs: []}]}, hass({id: 'u1', name: 'Ali'}));
  assert.equal(d.views.length, 1);
  assert(JSON.stringify(d).includes('Nothing is set up for you yet'));
  assert(!JSON.stringify(d).includes('light.saloon'));
});

test('the editor shows tabs, adds a picker for each ticked tab, and saves both', async () => {
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
    form(schema, data, callback, labels) { if (labels.tabs) forms.push({user: labels.tabs.split(':')[0], fields: schema.map(f => f.name), schema, data, callback}); return {}; },
    change(config) { this.config = config; }
  };
  globalThis.document = {createElement: () => ({setAttribute() {}, append() {}, replaceChildren() {}, style: {}, textContent: ''}), querySelector: () => null};
  await DwellDeckOriginalEditor.prototype.renderLimitedUsers.call(editor, {replaceChildren() {}, append() {}});
  const last = user => forms.filter(f => f.user === user).at(-1);
  assert.deepEqual(forms.map(f => f.user), ['Ali', 'Sara'], 'admins and system users are not listed');
  assert.deepEqual(last('Ali').fields, ['tabs', 'rooms'], 'an old rooms-only entry shows as the Rooms tab');
  assert.deepEqual(last('Ali').data.rooms, {area_id: ['old_room'], device_id: [], entity_id: []});
  assert.deepEqual(last('Sara').fields, ['tabs'], 'no pickers until a tab is ticked');
  assert(last('Sara').schema[0].selector.select.options.some(o => o.value === 'media'));
  last('Sara').callback({tabs: ['rooms', 'media']});
  assert.deepEqual(last('Sara').fields, ['tabs', 'rooms', 'media'], 'one picker per ticked tab, in tab order');
  assert(last('Sara').schema[1].selector.target);
  last('Sara').callback({tabs: ['rooms', 'media'], rooms: {area_id: ['sara_room']}, media: {entity_id: ['media_player.sara_tv'], device_id: []}});
  last('Ali').callback({tabs: ['rooms'], rooms: {area_id: ['ali_room']}});
  assert.deepEqual(editor.config.kids, [
    {user: 'k2', name: 'Sara', tabs: ['rooms', 'media'], access: {rooms: {area_id: ['sara_room']}, media: {entity_id: ['media_player.sara_tv']}}},
    {user: 'k1', name: 'Ali', tabs: ['rooms'], access: {rooms: {area_id: ['ali_room']}}}]);
  last('Sara').callback({tabs: ['media'], rooms: {area_id: ['sara_room']}, media: {entity_id: ['media_player.sara_tv']}});
  assert.deepEqual(last('Sara').fields, ['tabs', 'media'], 'unticking a tab removes its picker');
  assert.deepEqual(editor.config.kids.find(k => k.user === 'k2'), {user: 'k2', name: 'Sara', tabs: ['media'], access: {media: {entity_id: ['media_player.sara_tv']}}}, 'and what was picked there');
  last('Sara').callback({tabs: []});
  last('Ali').callback({tabs: []});
  assert.equal(editor.config.kids, undefined, 'no tabs: back to the full dashboard');
  delete globalThis.document;
});

test('the guard sets back what a limited user changes outside their rooms', async () => {
  const {guardAutomation, allowedEntities, GUARDED_DOMAINS} = await import('../src/guard.mjs');
  const h = hass({id: 'a', name: 'Youssef'});
  const allowedAli = allowedEntities(['Ali Room'], h);
  for (const id of ['light.ali_ceiling', 'media_player.ali_tv', 'climate.ali_ac']) assert(allowedAli.includes(id), id);
  assert(!allowedAli.includes('light.saloon'));
  const users = [{id: 'k1', name: 'Ali'}, {id: 'k2', name: 'Sara'}, {id: 'k3', name: 'Old'}];
  const g = guardAutomation({kids: [{user: 'Ali', tabs: ['rooms'], access: {rooms: {area_id: ['ali_room']}}}, {user: 'k2', tabs: ['media'], access: {media: {entity_id: ['media_player.ali_tv']}}},
    {user: 'Old', rooms: ['ali_room']}, {user: 'Ghost', tabs: ['rooms'], access: {rooms: {area_id: ['x']}}}], protected: ['light.ali_ceiling']}, h, users);
  assert.deepEqual(Object.keys(g.variables.allowed), ['k1', 'k2', 'k3'], 'names become user ids; unknown users are skipped');
  assert.deepEqual(g.variables.allowed.k2, ['media_player.ali_tv'], 'what was picked one by one');
  assert(!g.variables.allowed.k1.includes('camera.ali_cam') && !g.variables.allowed.k1.includes('binary_sensor.ali_window'), 'an area gives its lights, TVs, ACs and curtains, not everything in it');
  assert(g.variables.allowed.k3.includes('climate.ali_ac'), 'an entry from before tabs keeps its rooms');
  assert.deepEqual(g.variables.protected, ['light.ali_ceiling']);
  for (const d of ['switch', 'valve', 'climate', 'water_heater', 'automation', 'lock']) assert(GUARDED_DOMAINS.includes(d), d);
  assert(!GUARDED_DOMAINS.includes('light') && !GUARDED_DOMAINS.includes('media_player'));
  const decide = (userId, entityId) => {
    const allowed = g.variables.allowed;
    if (!(userId in allowed)) return false;
    return g.variables.protected.includes(entityId) || (!allowed[userId].includes(entityId) && g.variables.guarded_domains.includes(entityId.split('.')[0]));
  };
  assert.equal(decide('k1', 'switch.boiler'), true);
  assert.equal(decide('k1', 'climate.saloon_ac'), true);
  assert.equal(decide('k1', 'climate.ali_ac'), false, 'their own AC');
  assert.equal(decide('k2', 'climate.ali_ac'), true, 'not picked for them');
  assert.equal(decide('k1', 'light.saloon'), false);
  assert.equal(decide('k1', 'light.ali_ceiling'), true, 'protected even in their room');
  assert.equal(decide('admin', 'switch.boiler'), false, 'other users are never touched');
});
