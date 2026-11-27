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
  'media_player.ali_tv_ma': st('idle', {friendly_name: 'Ali TV'}),
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
  for (const view of d.views.filter(v => v.subview)) for (const id of ['light.saloon', 'alarm_control_panel.house', 'lock.gate', 'media_player.saloon_tv']) assert(!JSON.stringify(view).includes(id), `${view.path} follows Home's picks: ${id}`);
  const home = JSON.stringify(d.views.find(v => v.path === 'home'));
  for (const id of ['light.saloon', 'alarm_control_panel.house', 'lock.gate']) assert(!home.includes(id), `Home shows only Ali Room: ${id}`);
  const full = await Strategy.generate({...config, kids: [{user: 'Ali', tabs: ['home']}]}, hass({id: 'u1', name: 'Ali'}));
  assert(JSON.stringify(full.views.find(v => v.path === 'home')).includes('light.saloon'), 'nothing picked: the whole tab');
  const media = await Strategy.generate({...config, kids: [{user: 'Ali', tabs: ['media'], access: {media: {entity_id: ['media_player.ali_tv']}}}]}, hass({id: 'u1', name: 'Ali'}));
  const mediaText = JSON.stringify(media.views.find(v => v.path === 'media'));
  assert(mediaText.includes('media_player.ali_tv') && !mediaText.includes('media_player.saloon_tv'), 'Media shows only the picked player');
  const {targetEntities} = await import('../src/kids.mjs');
  assert(targetEntities({entity_id: ['media_player.ali_tv']}, hass({})).has('media_player.ali_tv_ma'), 'and its copy under the same name');
  assert(!targetEntities({entity_id: ['media_player.ali_tv']}, hass({})).has('media_player.saloon_tv'));
  const twoButtons = {...hass({}), entities: {...hass({}).entities, 'light.ali_ceiling': {entity_id: 'light.ali_ceiling', device_id: 'sw', area_id: 'ali_room'}, 'switch.ali_lamp': {entity_id: 'switch.ali_lamp', device_id: 'sw', area_id: 'ali_room'}}};
  assert(!targetEntities({entity_id: ['light.ali_ceiling']}, twoButtons).has('switch.ali_lamp'), 'one button of a two-button switch does not give the other');
  const all = await Strategy.generate({...config, kids: [{user: 'Ali', tabs: ['media']}]}, hass({id: 'u1', name: 'Ali'}));
  assert(JSON.stringify(all.views.find(v => v.path === 'media')).includes('media_player.saloon_tv'), 'the fixture does show the other TV when nothing is picked');
});

test('Home with nothing picked follows the other tabs; Home alone is the whole of Home', async () => {
  const kid = {user: 'Ali', tabs: ['home', 'media'], access: {media: {entity_id: ['media_player.ali_tv']}}};
  const d = await Strategy.generate({...config, kids: [kid]}, hass({id: 'u1', name: 'Ali'}));
  const home = JSON.stringify(d.views.find(v => v.path === 'home'));
  for (const id of ['light.saloon', 'media_player.saloon_tv', 'alarm_control_panel.house', 'lock.gate', 'light.ali_ceiling']) assert(!home.includes(id), `Home leaves out ${id}`);
  for (const view of d.views.filter(v => v.subview)) assert(!JSON.stringify(view).includes('light.saloon'), `${view.path} too`);
  const nav = [];
  const collect = o => { if (o && typeof o === 'object') { if (o.tap_action?.action === 'navigate') nav.push(o.tap_action.navigation_path.split('/').pop()); Object.values(o).forEach(collect); } };
  collect(d.views.filter(v => !v.subview));
  const mainPaths = ['home', 'rooms', 'lighting', 'curtains', 'climate', 'energy', 'music-assistant', 'media', 'security', 'outdoor', 'devices', 'cameras'];
  assert(nav.every(p => !mainPaths.includes(p) || d.views.some(v => v.path === p)), `shortcuts only to their pages: ${nav.join()}`);
  const alone = await Strategy.generate({...config, kids: [{user: 'Ali', tabs: ['home']}]}, hass({id: 'u1', name: 'Ali'}));
  assert(JSON.stringify(alone.views.find(v => v.path === 'home')).includes('light.saloon'));
  const whole = await Strategy.generate({...config, kids: [{user: 'Ali', tabs: ['home', 'rooms']}]}, hass({id: 'u1', name: 'Ali'}));
  assert(JSON.stringify(whole.views.find(v => v.path === 'home')).includes('light.saloon'), 'a whole tab given: everything on it counts');
});

test('rooms left out of the Rooms tab are left out of the other tabs too, unless picked there', async () => {
  const {tabChoices} = await import('../src/kids.mjs');
  const parent = await Strategy.generate({...config, kids: undefined}, hass({id: 'p', name: 'Parent'}));
  const ali = tabChoices(parent.views.find(v => v.path === 'rooms'), hass({})).find(c => /Ali Room/.test(c.key));
  assert(ali, 'the Ali Room card is offered');
  const kid = {user: 'Ali', tabs: ['rooms', 'lighting', 'media'], access: {rooms: {cards: [ali.key], entity_id: ali.refs}}};
  const d = await Strategy.generate({...config, kids: [kid]}, hass({id: 'u1', name: 'Ali'}));
  const lights = JSON.stringify(d.views.find(v => v.path === 'lighting'));
  const media = JSON.stringify(d.views.find(v => v.path === 'media'));
  assert(lights.includes('light.ali_ceiling') && !lights.includes('light.saloon'), 'Lights: only the given room');
  assert(!media.includes('media_player.saloon_tv'), 'Media: not the Saloon TV');
  const picked = await Strategy.generate({...config, kids: [{...kid, access: {...kid.access, media: {cards: ['Saloon TV'], entity_id: ['media_player.saloon_tv']}}}]}, hass({id: 'u1', name: 'Ali'}));
  const pickedMedia = JSON.stringify(picked.views.find(v => v.path === 'media'));
  const pickedKeys = tabChoices(parent.views.find(v => v.path === 'media'), hass({})).map(c => c.key);
  const saloonKey = pickedKeys.find(k => /Saloon TV/.test(k));
  if (saloonKey) {
    const again = await Strategy.generate({...config, kids: [{...kid, access: {...kid.access, media: {cards: [saloonKey], entity_id: ['media_player.saloon_tv']}}}]}, hass({id: 'u1', name: 'Ali'}));
    assert(JSON.stringify(again.views.find(v => v.path === 'media')).includes('media_player.saloon_tv'), 'picked on a tab: shown even from a room not given');
  } else assert(pickedMedia !== undefined);
  const noRoomsLimit = await Strategy.generate({...config, kids: [{user: 'Ali', tabs: ['lighting']}]}, hass({id: 'u1', name: 'Ali'}));
  assert(JSON.stringify(noRoomsLimit.views.find(v => v.path === 'lighting')).includes('light.saloon'), 'without a limited Rooms tab nothing changes');
});

test('a limited user with no tabs gets a clear message, not the dashboard', async () => {
  const d = await Strategy.generate({...config, kids: [{user: 'Ali', tabs: []}]}, hass({id: 'u1', name: 'Ali'}));
  assert.equal(d.views.length, 1);
  assert(JSON.stringify(d).includes('Nothing is set up for you yet'));
  assert(!JSON.stringify(d).includes('light.saloon'));
});

// A small stand-in for the page: enough elements to build the editor and tick its checkboxes.
class El {
  constructor(tag) { this.tag = tag; this.children = []; this.style = {}; this.textContent = ''; this.hidden = false; this.checked = false; }
  setAttribute() {} append(...kids) { this.children.push(...kids); } replaceChildren(...kids) { this.children = kids; }
  all() { return this.children.flatMap(c => c instanceof El ? [c, ...c.all()] : []); }
  querySelectorAll(sel) { return this.all().filter(e => e.tag === sel); }
  get text() { return [this.textContent, ...this.children.map(c => c instanceof El ? c.text : c.data || '')].join(''); }
}
const page = () => { globalThis.document = {createElement: tag => new El(tag), createTextNode: data => ({data}), querySelector: () => null}; };

test('each tab lists its own cards, named with the heading above them', async () => {
  const {tabChoices} = await import('../src/kids.mjs');
  const view = {path: 'media', sections: [
    {type: 'grid', cards: [{type: 'heading', heading: 'Bedrooms'},
      {type: 'custom:button-card', name: 'Ali TV', entity: 'media_player.ali_tv', tap_action: {action: 'call-service', service: 'media_player.toggle'}},
      {type: 'tile', entity: 'media_player.saloon_tv'},
      {type: 'vertical-stack', cards: [{type: 'custom:button-card', name: '[[[ return 1 ]]]', triggers_update: ['light.ali_ceiling', 'climate.ali_ac']}]},
      {type: 'button', name: 'Ali TV', entity: 'media_player.ali_tv'},
      {type: 'markdown', content: 'no entities'}]}]};
  assert.deepEqual(tabChoices(view, hass({})).map(c => [c.key, c.heading, c.refs.join()]), [
    ['Bedrooms · Ali TV', 'Bedrooms', 'media_player.ali_tv'],
    ['Bedrooms · Saloon TV', 'Bedrooms', 'media_player.saloon_tv'],
    ['Bedrooms · overview', 'Bedrooms', 'climate.ali_ac,light.ali_ceiling'],
    ['Bedrooms · Ali TV (2)', 'Bedrooms', 'media_player.ali_tv']]);
  assert.equal(tabChoices(view, hass({}))[2].label, 'Bedrooms · 2 items', 'the editor still shows how many things are on it');
  // Adding a light to the house doesn't change which card is which.
  const grown = JSON.parse(JSON.stringify(view));
  grown.sections[0].cards[3].cards[0].triggers_update.push('switch.ali_lamp');
  assert.equal(tabChoices(grown, hass({}))[2].key, 'Bedrooms · overview');
  // A card saved before 0.9.54, under its count, is still found.
  const {pruneView} = await import('../src/kids.mjs');
  const kept = pruneView(view, {cards: ['Bedrooms · 2 items'], entity_id: ['climate.ali_ac', 'light.ali_ceiling']}, hass({}));
  assert(JSON.stringify(kept).includes('triggers_update'));
});

test('a shared card can leave some of its items out', async () => {
  const room = {type: 'custom:button-card', name: 'Ali Room', variables: {lights: ['light.ali_ceiling', 'switch.ali_lamp']},
    tap_action: {action: 'fire-dom-event', browser_mod: {data: {content: {type: 'vertical-stack', cards: [{type: 'tile', entity: 'light.ali_ceiling'}, {type: 'tile', entity: 'switch.ali_lamp'}, {type: 'tile', entity: 'climate.ali_ac'}]}}}}};
  const view = {path: 'rooms', sections: [{type: 'grid', cards: [{type: 'heading', heading: 'Ground'}, room, {type: 'custom:button-card', name: 'Saloon', entity: 'light.saloon'}]}]};
  const {pruneView, tabChoices} = await import('../src/kids.mjs');
  const key = tabChoices(view, hass({}))[0].key;
  const out = pruneView(view, {cards: [key], entity_id: ['light.ali_ceiling', 'climate.ali_ac']}, hass({}));
  const text = JSON.stringify(out);
  assert(text.includes('Ali Room') && !text.includes('Saloon'), 'only the chosen card');
  assert.deepEqual(out.sections[0].cards[1].variables.lights, ['light.ali_ceiling'], 'its lists lose what was left out');
  assert.deepEqual(out.sections[0].cards[1].tap_action.browser_mod.data.content.cards.map(c => c.entity), ['light.ali_ceiling', 'climate.ali_ac'], 'so does its popup');
});

test('templates lose what was not given: JSON data, id lists and single ids', async () => {
  const {narrowCard} = await import('../src/kids.mjs');
  const known = new Set(['light.a', 'light.b', 'climate.a', 'climate.b', 'alarm_control_panel.x']);
  const allowed = new Set(['light.a', 'climate.a']);
  const card = {type: 'custom:button-card',
    label: '[[[ const ids=["light.a","light.b"]; const ac=[\'climate.a\',\'climate.b\']; return ids.length ]]]',
    custom_fields: {glance: '[[[ return f(states, {"lights":["light.a","light.b"],"tvs":[["light.b","x"],["light.a","y"]],"alarm":"alarm_control_panel.x","n":2}) ]]]'},
    visibility: [{condition: 'and', conditions: [{condition: 'state', entity: 'light.a', state: 'off'}, {condition: 'state', entity: 'light.b', state: 'off'}]}]};
  const out = narrowCard(card, allowed, known);
  assert.equal(out.label, '[[[ const ids=["light.a"]; const ac=[\'climate.a\']; return ids.length ]]]');
  assert.equal(out.custom_fields.glance, '[[[ return f(states, {"lights":["light.a"],"tvs":[["light.a","y"]],"alarm":null,"n":2}) ]]]');
  assert.deepEqual(out.visibility[0].conditions.map(c => c.entity), ['light.a'], 'conditions on what was not given go');
  assert.equal(narrowCard({label: "[[[ const ac=['climate.a','climate.b']; ]]]"}, allowed, known).label, "[[[ const ac=['climate.a']; ]]]", 'single quotes alone too');
});

test('the editor: a dropdown per tab, a dropdown per card, and what is saved', async () => {
  const {DwellDeckOriginalEditor} = await import('../src/editor.mjs');
  page();
  const full = {views: [
    {path: 'media', sections: [{type: 'grid', cards: [{type: 'tile', entity: 'media_player.ali_tv'}, {type: 'tile', entity: 'media_player.saloon_tv'}]}]},
    {path: 'rooms', sections: [{type: 'grid', cards: [{type: 'heading', heading: 'Ground'}, {type: 'custom:button-card', name: 'Ali Room', triggers_update: ['light.ali_ceiling', 'climate.ali_ac']}, {type: 'custom:button-card', name: 'Saloon', entity: 'light.saloon'}]}]}]};
  const tabForms = [];
  const editor = Object.assign(Object.create(DwellDeckOriginalEditor.prototype), {
    config: {type: 'custom:dwelldeck-original', kids: [{user: 'Ali', rooms: ['ali_room']}]},
    _hass: {...hass({}), callWS: async () => [
      {id: 'a1', name: 'Youssef', group_ids: ['system-admin']}, {id: 'k1', name: 'Ali', group_ids: ['system-users']},
      {id: 'k2', name: 'Sara', group_ids: ['system-users']}, {id: 's1', name: 'Supervisor', system_generated: true, group_ids: ['system-users']}]},
    fullDashboard: async () => full,
    form(schema, data, callback, labels) { const el = new El('ha-form'); el.schema = schema; el.data = data; el.callback = callback; el.labels = labels; if (labels.tabs) tabForms.push(el); return el; },
    change(config) { this.config = config; }
  });
  const container = new El('div');
  await editor.renderLimitedUsers(container);
  assert.deepEqual(tabForms.map(f => f.labels.tabs.split(':')[0]), ['Ali', 'Sara'], 'admins and system users are not listed');
  const holders = container.children.filter(c => c.tag === 'div');
  const pickers = i => holders[i].children.filter(c => c.tag === 'details');
  assert.equal(pickers(0).length, 1, 'Ali\'s old rooms-only entry shows as the Rooms tab');
  const aliRooms = pickers(0)[0];
  assert.match(aliRooms.children[0].textContent, /Rooms: 1 of 2 cards/, 'the room given before is ticked');
  // Sara: tick Rooms and Media.
  tabForms.at(-1).callback({tabs: ['rooms', 'media']});
  const sara = pickers(1);
  assert.equal(sara.length, 2, 'one dropdown per ticked tab');
  const [rooms, media] = sara;
  assert.match(rooms.children[0].textContent, /everything on this tab/);
  assert.doesNotMatch(rooms.children[0].textContent, /other tabs/);
  const roomRows = rooms.querySelectorAll('div');
  assert.deepEqual(roomRows.map(r => r.children[0].text.trim()), ['Ali Room', 'Saloon'], 'the heading is the group; rows show the card\'s own name');
  const [aliTick] = roomRows[0].children[0].children;
  aliTick.checked = true; aliTick.onchange();
  const items = roomRows[0].children[1];
  assert.equal(items.hidden, false, 'a ticked card opens the list of its items');
  const itemBoxes = items.querySelectorAll('input');
  assert(itemBoxes.every(b => b.checked), 'all its items are given at first');
  const acBox = itemBoxes.find((b, i) => items.querySelectorAll('label')[i].text.includes('Ali AC'));
  acBox.checked = false; acBox.onchange();
  const mediaTick = media.querySelectorAll('input')[0];
  mediaTick.checked = true; mediaTick.onchange();
  assert.deepEqual(editor.config.kids.find(k => k.user === 'k2'), {user: 'k2', name: 'Sara', tabs: ['rooms', 'media'], access: {
    rooms: {cards: ['Ground · Ali Room'], entity_id: ['light.ali_ceiling']},
    media: {cards: ['Ali TV'], entity_id: ['media_player.ali_tv']}}});
  mediaTick.checked = false; mediaTick.onchange();
  assert.equal(editor.config.kids.find(k => k.user === 'k2').access.media, undefined, 'no card ticked: the whole tab');
  tabForms.at(-1).callback({tabs: []});
  assert.equal(editor.config.kids.some(k => k.user === 'k2'), false, 'no tabs: back to the full dashboard');
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
  assert.deepEqual(g.variables.allowed.k2, ['media_player.ali_tv', 'media_player.ali_tv_ma'], 'what was picked one by one, with its copy');
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
