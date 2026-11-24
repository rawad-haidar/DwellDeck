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
const tvHass=()=>{
 const st=(id,a={})=>({entity_id:id,state:'on',attributes:{friendly_name:id,...a}});
 const ents=[['media_player.tv','androidtv_remote','d1',{source_list:['HDMI 1','Netflix']}],['remote.tv','androidtv_remote','d1',{activity_list:['Netflix','YouTube'],current_activity:'YouTube'}],['media_player.atv','apple_tv','d2',{source_list:['Netflix','Shahid']}],['remote.atv','apple_tv','d2',{}],['media_player.speaker','cast','d3',{}]];
 return {states:Object.fromEntries(ents.map(([id,,,a])=>[id,st(id,a)])),services:{browser_mod:{popup:{}}},areas:{a:{area_id:'a',name:'Living room',labels:[]}},floors:{},labels:{},
  devices:{d1:{id:'d1',area_id:'a'},d2:{id:'d2',area_id:'a'},d3:{id:'d3',area_id:'a'}},entities:Object.fromEntries(ents.map(([id,platform,device_id])=>[id,{entity_id:id,platform,device_id,area_id:'a'}]))};
};
const tvCards=()=>{
 const d=generateOriginal(ORIGINAL_TEMPLATE,SLOTS,ROOM_TEMPLATES,{dashboard_path:'/x',area_rooms:true,room_controls:true,auto_discover:true},tvHass());
 const cards={};const find=x=>{if(x&&typeof x==='object'){if(x.type==='custom:button-card'&&x.entity?.startsWith('media_player.')&&x.custom_fields?.head)cards[x.entity]=x;Object.values(x).forEach(find);}};find(d.views.find(v=>v.path==='rooms'));
 return {cards,text:JSON.stringify(d.views.find(v=>v.path==='rooms'))};
};
const actions=card=>{const out=[];const walk=x=>{if(x&&typeof x==='object'){if(x.tap_action?.perform_action)out.push(x.tap_action);if(x.tap_action?.browser_mod)out.push(x.tap_action);Object.values(x).forEach(walk);}};walk(card.custom_fields);return out;};
test('each TV is one card with remote, volume, keyboard, and apps and inputs',()=>{
 const {cards,text}=tvCards();
 assert(!text.includes('"media-control"'));
 const tv=actions(cards['media_player.tv']);
 const commands=tv.map(a=>a.data?.command).filter(Boolean);
 for(const c of ['DPAD_UP','DPAD_CENTER','BACK','HOME','MENU','VOLUME_UP','MUTE','MEDIA_PLAY_PAUSE'])assert(commands.includes(c),c);
 assert(tv.some(a=>a.browser_mod?.data?.right_button_action?.service==='remote.send_command'));
 assert.deepEqual(tv.filter(a=>a.perform_action==='remote.turn_on').map(a=>a.data.activity),['Netflix','YouTube']);
 assert.deepEqual(tv.filter(a=>a.perform_action==='media_player.select_source').map(a=>a.data.source),['HDMI 1']);
 const atv=actions(cards['media_player.atv']);
 assert(atv.some(a=>a.data?.command==='select'));
 assert(!atv.some(a=>a.browser_mod));
 assert.deepEqual(atv.filter(a=>a.perform_action==='media_player.select_source').map(a=>a.data.source),['Netflix','Shahid']);
 const speaker=actions(cards['media_player.speaker']);
 assert(speaker.some(a=>a.perform_action==='media_player.volume_up'));
 assert(!speaker.some(a=>a.perform_action==='remote.send_command'));
 assert(!cards['media_player.speaker'].custom_fields.pad);
});
