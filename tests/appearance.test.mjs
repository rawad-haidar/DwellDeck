import {test} from 'node:test';
import assert from 'node:assert/strict';
globalThis.HTMLElement=class{};
globalThis.customElements={get:()=>undefined,define:()=>{}};
globalThis.window={};
const {ORIGINAL_TEMPLATE,SLOTS,ROOM_TEMPLATES,generateOriginal}=await import('../dwelldeck.js');
const generate=config=>generateOriginal(ORIGINAL_TEMPLATE,SLOTS,ROOM_TEMPLATES,{dashboard_path:'/dashboard-test',...config});
test('all colour palettes apply to cards without mutating the template',()=>{
 const before=JSON.stringify(ORIGINAL_TEMPLATE);
 for(const [key,color] of Object.entries({emerald:'#183d38',violet:'#332547',rose:'#432b38',slate:'#303944'})){
  const result=generate({color_palette:key});
  assert(JSON.stringify(result).includes(color));
  assert(result.views.every(view=>view.card_mod.style.includes('--accent-color:')));
 }
 assert.equal(JSON.stringify(ORIGINAL_TEMPLATE),before);
});
test('unknown palettes fall back to Lamplight and motion honours reduced-motion',()=>{
 const result=JSON.stringify(generate({color_palette:'unknown'}));
 assert(result.includes('#212a35'));
 assert(!result.includes('#29d5ee'));
 assert(result.includes('prefers-reduced-motion:reduce'));
 assert(result.includes('dwell-breathe'));
});
test('lighting cards retain active light names in their summary',()=>{
 const room=ROOM_TEMPLATES[0];
 const result=generate({rooms:{[room.key]:{entities:['light.test_one']}}});
 const card=result.views.find(view=>view.path==='lighting').sections[room.section].cards[room.card];
 assert(card.label.includes('friendly_name'));
 assert(card.label.includes('light.test_one'));
 assert(card.triggers_update.includes('light.test_one'));
});
test('every palette recolours accents, not only card backgrounds',()=>{
 for(const key of ['lamplight','emerald','violet','rose','slate']){
  const text=JSON.stringify(generate({color_palette:key})).toLowerCase();
  assert(!text.includes('#29d5ee'),key+' still has the original cyan');
  assert(!text.includes('#1b2d40'),key+' still has the original tile colour');
 }
 assert(JSON.stringify(generate({color_palette:'ocean'})).includes('#29d5ee'));
});
test('colours have one spelling and the unavailable graph colour stays visible',()=>{
 const text=JSON.stringify(generate({}));
 assert(!/rgba\(\s*\d+\s*,\s+\d/.test(text));
 assert(!text.includes('#586a80'));
});
test('no text is smaller than 12px and cards do not slide in or lift',()=>{
 const text=JSON.stringify(generate({}));
 assert(!/font-size\s*:\s*(?:[0-9]|1[01])(?:\.\d+)?px/.test(text));
 assert(!/"font-size":"(?:[0-9]|1[01])px"/.test(text));
 assert(!text.includes('dwell-arrive'));
 assert(!text.includes('ha-card:hover'));
 assert(text.includes('dwell-breathe'));
});
test('air conditioning counts configured units and uses sentence case',()=>{
 const text=JSON.stringify(generate({}));
 assert(!text.includes('of 6 enabled'));
 assert(text.includes('${ids.filter(id=>states[id]).length} on'));
 assert(!text.includes("text:'COOLING'"));
});
test('Home opens with the live sky and information cards are not boxed',()=>{
 const d=generate({});
 const first=d.views[0].sections[0].cards;
 assert(first[0].custom_fields?.sky||first[0].content==='Select an entity in DwellDeck setup.');
 const bound=generate({entities:Object.fromEntries(SLOTS.filter(s=>s.domain==='weather').map(s=>[s.key,'weather.home']))});
 assert(bound.views[0].sections[0].cards[0].custom_fields?.sky);
 assert(!first.some(c=>c.type==='heading'&&c.heading==='Welcome home'));
 assert(!JSON.stringify(first).includes('☀️'));
 const markdown=[];const find=x=>{if(x&&typeof x==='object'){if(x.type==='markdown')markdown.push(x);Object.values(x).forEach(find);}};find(d);
 assert(markdown.length&&markdown.every(c=>JSON.stringify(c.card_mod).includes('background:transparent!important')));
});
test('the readable font can be switched off',()=>{
 assert(JSON.stringify(generate({})).includes('Atkinson Hyperlegible Next'));
 assert(!JSON.stringify(generate({font:'system'})).includes('Atkinson Hyperlegible Next'));
});
test('Home weather is the live hero card spanning two columns',()=>{
 const key=SLOTS.find(s=>s.placeholder==='weather.dwelldeck_slot_295').key;
 const d=generate({entities:{[key]:'weather.home'}});
 const section=d.views[0].sections[0];const card=section.cards[0];
 assert.equal(section.column_span,2);
 assert(card.custom_fields.sky.includes('weather/subscribe_forecast'));
 assert(card.custom_fields.sky.includes('"weather":"weather.home"'));
 assert(!card.custom_fields.sky.slice(3,-3).includes(']]]'));
 assert(card.custom_fields.sky.includes('prefers-reduced-motion'));
});
test('TVs in discovered rooms get playback, volume, apps and a remote pad for their integration',()=>{
 const st=(id,a={})=>({entity_id:id,state:'on',attributes:{friendly_name:id,...a}});
 const ents=[['media_player.tv','androidtv_remote','d1',{}],['remote.tv','androidtv_remote','d1',{activity_list:['Netflix','YouTube','Shahid'],current_activity:'YouTube'}],['media_player.atv','apple_tv','d2',{source_list:['Netflix']}],['remote.atv','apple_tv','d2',{}]];
 const hass={states:Object.fromEntries(ents.map(([id,,,a])=>[id,st(id,a)])),services:{browser_mod:{popup:{}}},areas:{a:{area_id:'a',name:'Living room',labels:[]}},floors:{},labels:{},
  devices:{d1:{id:'d1',area_id:'a'},d2:{id:'d2',area_id:'a'}},entities:Object.fromEntries(ents.map(([id,platform,device_id])=>[id,{entity_id:id,platform,device_id,area_id:'a'}]))};
 const d=generateOriginal(ORIGINAL_TEMPLATE,SLOTS,ROOM_TEMPLATES,{dashboard_path:'/x',area_rooms:true,room_controls:true,auto_discover:true},hass);
 const stacks=[];const find=x=>{if(x&&typeof x==='object'){if(x.type==='vertical-stack'&&x.cards?.[0]?.type==='media-control')stacks.push(x);Object.values(x).forEach(find);}};find(d.views.find(v=>v.path==='rooms'));
 const tv=stacks.find(s=>s.cards[0].entity==='media_player.tv');const atv=stacks.find(s=>s.cards[0].entity==='media_player.atv');
 const pad=s=>s.cards.find(c=>c.type==='vertical-stack'&&c.cards[0].heading==='Remote').cards[1].cards;
 const commands=s=>pad(s).map(b=>b.tap_action.data?.command).filter(Boolean);
 assert(commands(tv).includes('DPAD_CENTER')&&commands(atv).includes('select'));
 assert(atv.cards.some(c=>c.type==='vertical-stack'&&c.cards[0].heading==='Apps'));
 assert(pad(tv).every(b=>!b.tap_action.target||b.tap_action.target.entity_id));
});
test('TV apps come from sources or Android TV remote activities and open on tap',()=>{
 const st=(id,a={})=>({entity_id:id,state:'on',attributes:{friendly_name:id,...a}});
 const ents=[['media_player.tv','androidtv_remote','d1',{}],['remote.tv','androidtv_remote','d1',{activity_list:['Netflix','YouTube']}],['media_player.atv','apple_tv','d2',{source_list:['Netflix','Shahid']}],['remote.atv','apple_tv','d2',{}]];
 const hass={states:Object.fromEntries(ents.map(([id,,,a])=>[id,st(id,a)])),services:{browser_mod:{popup:{}}},areas:{a:{area_id:'a',name:'Living room',labels:[]}},floors:{},labels:{},
  devices:{d1:{id:'d1',area_id:'a'},d2:{id:'d2',area_id:'a'}},entities:Object.fromEntries(ents.map(([id,platform,device_id])=>[id,{entity_id:id,platform,device_id,area_id:'a'}]))};
 const d=generateOriginal(ORIGINAL_TEMPLATE,SLOTS,ROOM_TEMPLATES,{dashboard_path:'/x',area_rooms:true,room_controls:true,auto_discover:true},hass);
 const stacks=[];const find=x=>{if(x&&typeof x==='object'){if(x.type==='vertical-stack'&&x.cards?.[0]?.type==='media-control')stacks.push(x);Object.values(x).forEach(find);}};find(d.views.find(v=>v.path==='rooms'));
 const apps=s=>s.cards.find(c=>c.type==='vertical-stack'&&c.cards[0].heading==='Apps').cards[1].cards;
 const tv=apps(stacks.find(s=>s.cards[0].entity==='media_player.tv'));const atv=apps(stacks.find(s=>s.cards[0].entity==='media_player.atv'));
 assert.deepEqual(tv.map(b=>b.tap_action.data.activity),['Netflix','YouTube']);
 assert.equal(tv[0].tap_action.perform_action,'remote.turn_on');
 assert.deepEqual(atv.map(b=>b.tap_action.data.source),['Netflix','Shahid']);
 assert.equal(atv[0].icon,'mdi:netflix');
});
