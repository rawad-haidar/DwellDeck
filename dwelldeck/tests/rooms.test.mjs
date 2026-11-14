import {test} from 'node:test';
import assert from 'node:assert/strict';
globalThis.HTMLElement = class {};
const registered = new Map();
globalThis.customElements = {get: name => registered.get(name), define: (name, value) => { assert(name.includes('-'), 'Custom element tags require a hyphen'); registered.set(name, value); }};
globalThis.window = {};
const {normalize, resolveRooms} = await import('../dwelldeck.js');
const registry = {areas: [{area_id:'garden',name:'Garden'}, {area_id:'kitchen',name:'Kitchen'}], devices:[{id:'d1',area_id:'garden'}], entities:[
  {entity_id:'light.one',device_id:'d1'}, {entity_id:'switch.two',area_id:'garden'},
  {entity_id:'light.hidden',area_id:'garden',hidden_by:'user'},
  {entity_id:'light.disabled',area_id:'garden',disabled_by:'user'},
  {entity_id:'sensor.temperature',area_id:'garden'}, {entity_id:'light.kitchen',area_id:'kitchen'},
  {entity_id:'light.override',device_id:'d1',area_id:'kitchen'}
]};
test('discovers device and entity areas, excludes hidden/disabled and filters domains',()=>{
  const rooms=resolveRooms(normalize({area_ids:['garden']}),registry);
  assert.equal(rooms.length,1); assert.deepEqual(rooms[0].entities,['light.one','switch.two']);
});
test('entity area overrides device area',()=>{
  assert(resolveRooms(normalize({}),registry).find(r=>r.area==='kitchen').entities.includes('light.override'));
});
test('manual entities, exclusions and duplicate removal use a single room list',()=>{
  const rooms=resolveRooms(normalize({auto_areas:false,rooms:[{name:'Outside',area:'garden',entities:['light.one','light.extra','light.extra'],excluded_entities:['switch.two']}]}),registry);
  assert.deepEqual(rooms[0].entities,['light.one','light.extra']); assert.equal(rooms[0].name,'Outside');
});
test('custom room overrides discovered area without a duplicate room',()=>{
  assert.equal(resolveRooms(normalize({rooms:[{area:'garden',name:'Outside'}]}),registry).filter(r=>r.area==='garden').length,1);
});
test('new devices appear without modifying stored configuration',()=>{
  const config=normalize({}); const before=JSON.stringify(config);
  const next=structuredClone(registry);next.entities.push({entity_id:'light.new',area_id:'garden'});
  assert(resolveRooms(config,next)[0].entities.includes('light.new'));assert.equal(JSON.stringify(config),before);
});
test('empty manual rooms remain configurable and unsupported auto domains are rejected',()=>{
  assert.equal(resolveRooms(normalize({auto_areas:false,rooms:[{name:'Empty'}]}),registry).length,1);
  assert.deepEqual(normalize({domains:['light','lock','invalid']}).domains,['light']);
});

test('card registration uses a valid custom element and matching stub type',()=>{
  assert(registered.has('dwelldeck-card'));
  assert.equal(registered.get('dwelldeck-card').getStubConfig().type,'custom:dwelldeck-card');
});
