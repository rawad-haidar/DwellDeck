import {test} from 'node:test';
import assert from 'node:assert/strict';
globalThis.HTMLElement=class{};
const registered=new Map();globalThis.customElements={get:k=>registered.get(k),define:(k,v)=>registered.set(k,v)};globalThis.window={};
const {ORIGINAL_TEMPLATE,SLOTS,ROOM_TEMPLATES,generateOriginal,roomEntities}=await import('../dwelldeck.js');
const config={dashboard_path:'/dashboard-test'};
test('preserves original Home and all fifteen views',()=>{
 const d=generateOriginal(ORIGINAL_TEMPLATE,SLOTS,ROOM_TEMPLATES,config);
 assert.equal(d.views.length,15);assert.equal(d.views[0].path,'home');assert.equal(d.views[0].type,'sections');
 assert(d.views[0].sections.length>=3);assert(d.views.some(v=>v.path==='popup-library'));
});
test('binding updates native cards, templates, graphs and popup references together',()=>{
 const slot=SLOTS.find(s=>s.domain==='light');
 const d=generateOriginal(ORIGINAL_TEMPLATE,SLOTS,ROOM_TEMPLATES,{...config,entities:{[slot.key]:'light.my_selected_light'}});
 const text=JSON.stringify(d);assert(text.includes('light.my_selected_light'));assert(!text.includes(slot.placeholder));
});
test('room selection regenerates popup controls and bulk action targets',()=>{
 const room=ROOM_TEMPLATES[0];const ids=['light.test_one','light.test_two'];
 const d=generateOriginal(ORIGINAL_TEMPLATE,SLOTS,ROOM_TEMPLATES,{...config,rooms:{[room.key]:{name:'My living room',entities:ids}}});
 const c=d.views.find(v=>v.path==='lighting').sections[room.section].cards[room.card];
 assert.equal(c.name,'My living room');const popup=c.tap_action.browser_mod.data;assert.equal(popup.title,'My living room | Lighting');
 const grid=popup.content.cards.find(c=>c.type==='grid');assert.deepEqual(grid.cards.map(c=>c.entity),ids);
 assert.deepEqual(popup.content.cards[1].cards[0].tap_action.target.entity_id,ids);
 assert(c.label.includes('light.test_two'));
});
test('area selection discovers lights and switches and respects exclusions',()=>{
 assert.deepEqual(roomEntities({area:'garden',exclude:['switch.b']},{devices:{d:{area_id:'garden'}},entities:{a:{entity_id:'light.a',device_id:'d'},b:{entity_id:'switch.b',area_id:'garden'},c:{entity_id:'sensor.c',area_id:'garden'}}}),['light.a']);
});
test('generator does not mutate its source and rejects malformed navigation roots',()=>{
 const before=JSON.stringify(ORIGINAL_TEMPLATE);generateOriginal(ORIGINAL_TEMPLATE,SLOTS,ROOM_TEMPLATES,config);assert.equal(JSON.stringify(ORIGINAL_TEMPLATE),before);
 assert.throws(()=>generateOriginal(ORIGINAL_TEMPLATE,SLOTS,ROOM_TEMPLATES,{dashboard_path:'https://elsewhere.test'}));
});
test('registers the original dashboard strategy with a visual settings editor',()=>{
 assert(registered.has('ll-strategy-dashboard-dwelldeck-original'));assert(registered.has('dwelldeck-original-editor'));
 assert.equal(window.customStrategies[0].strategyType,'dashboard');
});
test('extra rooms use the original card and popup style',()=>{
 const d=generateOriginal(ORIGINAL_TEMPLATE,SLOTS,ROOM_TEMPLATES,{...config,extra_rooms:[{name:'Patio',entities:['light.patio']}]});
 const section=d.views.find(v=>v.path==='lighting').sections.at(-1);const card=section.cards[1];
 assert.equal(card.name,'Patio');assert.equal(card.type,'custom:button-card');assert(card.styles.card.length);
 assert.equal(card.tap_action.browser_mod.data.title,'Patio | Lighting');
 assert.deepEqual(card.tap_action.browser_mod.data.content.cards.find(c=>c.type==='grid').cards.map(c=>c.entity),['light.patio']);
});
test('detects dashboard URL and keeps an explicit override',async()=>{
 const {inferDashboardPath}=await import('../dwelldeck.js');
 assert.equal(inferDashboardPath({},'/dashboard-my-home/home'),'/dashboard-my-home');
 assert.equal(inferDashboardPath({},'/config/lovelace/dashboards'),'/dashboard-dwelldeck');
 assert.equal(inferDashboardPath({dashboard_path:'/custom-home/'},'/dashboard-other/home'),'/custom-home');
});
test('built-in colors need no installed theme and preserve feature schemas',()=>{
 const d=generateOriginal(ORIGINAL_TEMPLATE,SLOTS,ROOM_TEMPLATES,config);
 assert(d.views.every(v=>!v.theme));
 assert(JSON.stringify(d).includes('--primary-text-color:#edf5ff'));
 const features=[];const walk=x=>{if(x&&typeof x==='object'){if(x.features)features.push(...x.features);Object.values(x).forEach(walk);}};walk(d);
 assert(features.every(feature=>!feature.card_mod));
});
test('an installed-theme override is retained',()=>{
 const d=generateOriginal(ORIGINAL_TEMPLATE,SLOTS,ROOM_TEMPLATES,{...config,theme:'Existing theme'});
 assert(d.views.every(v=>v.theme==='Existing theme'));
});
test('dependency checklist reports actual availability and install links',async()=>{
 const {dependencyStatus}=await import('../dwelldeck.js');
 const statuses=dependencyStatus({services:{browser_mod:{popup:{}}}},{get:name=>name==='button-card'?class{}:undefined});
 assert.equal(statuses.find(s=>s.name==='Button Card').ready,true);
 assert.equal(statuses.find(s=>s.name==='Browser Mod').ready,true);
 assert.equal(statuses.find(s=>s.name==='card-mod').ready,false);
 assert(statuses.every(s=>s.url.startsWith('https://my.home-assistant.io/redirect/hacs_repository/')));
 assert(statuses.find(s=>s.name==='Browser Mod').url.includes('category=integration'));
});
test('editor keeps forms mounted when HA echoes a field change',()=>{
 const Editor=registered.get('dwelldeck-original-editor');const editor=Object.create(Editor.prototype);
 let renders=0,events=0;editor.render=()=>renders++;editor.config={type:'custom:dwelldeck-original',rooms:{}};
 editor.dispatchEvent=event=>{events++;editor.setConfig(structuredClone(event.detail.config));};
 editor.change({...editor.config,rooms:{room_01:{name:'Living room'}}});
 assert.equal(renders,0);assert.equal(events,1);assert.equal(editor.config.rooms.room_01.name,'Living room');
 editor.change(structuredClone(editor.config));assert.equal(events,1);
});
test('form advances its data across successive edits',()=>{
 const previous=globalThis.document;let handler;globalThis.document={createElement:()=>({addEventListener:(type,fn)=>{handler=fn;}})};
 try{
  const Editor=registered.get('dwelldeck-original-editor');const editor=Object.create(Editor.prototype);
  const values=[];const form=editor.form([],{name:'Old',entities:['light.a']},value=>values.push(value));
  handler({stopPropagation(){},detail:{value:{...form.data,name:'New'}}});
  handler({stopPropagation(){},detail:{value:{...form.data,entities:['light.b']}}});
  assert.equal(values[1].name,'New');assert.deepEqual(values[1].entities,['light.b']);
 }finally{globalThis.document=previous;}
});
test('editor general and domain forms exclude unrelated configuration',()=>{
 const previous=globalThis.document;
 class Node{constructor(tag){this.tag=tag;this.children=[];this.dataset={};}append(...nodes){this.children.push(...nodes);}replaceChildren(){this.children=[];}addEventListener(){}}
 globalThis.document={createElement:tag=>new Node(tag)};
 try{
  const Editor=registered.get('dwelldeck-original-editor');const editor=Object.create(Editor.prototype);editor.shadowRoot=new Node('root');editor.renderDependencies=()=>{};
  const light=SLOTS.find(s=>s.domain==='light'),sensor=SLOTS.find(s=>s.domain==='sensor');
  editor.config={type:'custom:dwelldeck-original',rooms:{room_01:{name:'Keep this'}},entities:{[light.key]:'light.a',[sensor.key]:'sensor.b'}};
  editor.render();const forms=[];const scan=node=>{if(node.tag==='ha-form')forms.push(node);node.children.forEach(scan);};scan(editor.shadowRoot);
  assert(!('rooms' in forms[0].data));assert(!('entities' in forms[0].data));
  const lightForm=forms.find(f=>f.schema.some(s=>s.name===light.key));assert(!Object.hasOwn(lightForm.data,sensor.key));
 }finally{globalThis.document=previous;}
});
