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
 const st=(id,a={})=>({entity_id:id,state:'on',attributes:{...a}});
 const ents=[
  ['media_player.saloon_tv','androidtv_remote','d1',{friendly_name:'Saloon TV',source_list:['HDMI 2']}],
  ['remote.saloon_tv','androidtv_remote','d1',{activity_list:['Netflix','YouTube','HDMI 1'],current_activity:'YouTube'}],
  ['media_player.saloon_tv_adb','androidtv','d4',{friendly_name:'Saloon TV ADB',source_list:['com.android.systemui','Google TV Launcher','Netflix','com.netflix.tokenmanager','com.mbc.unknown.app','Google Cast']}],
  ['media_player.bedroom_adb','androidtv','d5',{friendly_name:'Bedroom TV',source_list:['com.google.android.youtube.tv','com.tcl.airplay2']}],
  ['media_player.atv','apple_tv','d2',{friendly_name:'Apple TV',source_list:['Netflix','Shahid']}],['remote.atv','apple_tv','d2',{}],
  ['media_player.speaker','cast','d3',{friendly_name:'Kitchen speaker'}],
  ['media_player.saloon_cast','cast','d6',{friendly_name:'Saloon TV(192.168.14.187) Saloon TV(192.168.14.246)'}]];
 return {states:Object.fromEntries(ents.map(([id,,,a])=>[id,st(id,a)])),services:{browser_mod:{popup:{}}},areas:{a:{area_id:'a',name:'Saloon',labels:[]},b:{area_id:'b',name:'Bedroom',labels:[]}},floors:{},labels:{},
  devices:{d1:{id:'d1',area_id:'a'},d2:{id:'d2',area_id:'a'},d3:{id:'d3',area_id:'a'},d4:{id:'d4',area_id:'a'},d5:{id:'d5',area_id:'b'},d6:{id:'d6',area_id:'a'}},entities:Object.fromEntries(ents.map(([id,platform,device_id])=>[id,{entity_id:id,platform,device_id}]))};
};
const tvCards=()=>{
 const d=generateOriginal(ORIGINAL_TEMPLATE,SLOTS,ROOM_TEMPLATES,{dashboard_path:'/x',area_rooms:true,room_controls:true,auto_discover:true},tvHass());
 const cards={};const find=x=>{if(x&&typeof x==='object'){if(x.type==='custom:button-card'&&x.entity?.startsWith('media_player.')&&x.custom_fields?.media)cards[x.entity]=x;Object.values(x).forEach(find);}};find(d.views.find(v=>v.path==='rooms'));
 return cards;
};
// The TV panel renders from states like button-card does; collect its tabs and the actions its buttons call.
const runField=(card,field,states)=>{globalThis.window=globalThis.window||{};const t=card.custom_fields[field].trim().slice(3,-3);return Function('states',t)(states);};
const unescape=v=>v.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const panel=(card,states=tvHass().states)=>{
 const html=runField(card,'panel',states);
 return {html,tabs:[...html.matchAll(/class="tab" data-tab="([^"]+)"/g)].map(m=>m[1]),
  calls:[...html.matchAll(/data-call="([^"]*)"/g)].map(m=>JSON.parse(unescape(m[1]))),
  names:pane=>[...(html.split(`class="pane ${pane}"`)[1]||'').split('class="pane ')[0].matchAll(/<span>([^<]*)<\/span>/g)].map(m=>unescape(m[1]))};
};
test('each TV is one compact card with Remote, Apps, Sources and Keyboard tabs and no popups',()=>{
 const cards=tvCards();
 assert.deepEqual(Object.keys(cards).sort(),['media_player.atv','media_player.bedroom_adb','media_player.saloon_tv','media_player.speaker']);
 for(const card of Object.values(cards))assert(!JSON.stringify(card).includes('browser_mod'));
 const saloon=panel(cards['media_player.saloon_tv']);
 assert.deepEqual(saloon.tabs,['remote','apps','sources','keys']);
 const commands=saloon.calls.filter(c=>c[1]==='send_command').map(c=>c[2].command);
 for(const c of ['DPAD_UP','DPAD_CENTER','BACK','HOME','MENU','MUTE'])assert(commands.includes(c),c);
 assert.deepEqual(saloon.names('apps-pane'),['Google Cast','Netflix','YouTube']);
 assert.deepEqual(saloon.names('sources'),['HDMI 1','HDMI 2','Home']);
 assert(saloon.html.includes('class="dw-kb"'));
 const bedroom=cards['media_player.bedroom_adb'];
 const adb=panel(bedroom);
 assert(adb.calls.some(c=>c[0]==='androidtv'&&c[1]==='adb_command'&&c[2].command==='CENTER'));
 assert(!adb.calls.some(c=>c[1]==='send_command'));
 assert.deepEqual(adb.names('apps-pane'),['YouTube']);
 assert(!adb.tabs.includes('keys'));
 const off=tvHass().states;off['media_player.bedroom_adb'].state='off';off['media_player.bedroom_adb'].attributes.source_list=[];
 assert(panel(bedroom,off).html.includes('Turn the TV on'));
 const live=tvHass().states;live['media_player.bedroom_adb'].attributes.source_list=['com.netflix.ninja','HDMI 4'];
 assert.deepEqual(panel(bedroom,live).names('apps-pane'),['Netflix']);
 assert.deepEqual(panel(bedroom,live).names('sources'),['HDMI 4']);
 const atv=panel(cards['media_player.atv']);
 assert(atv.calls.some(c=>c[2]?.command==='select'));
 assert(!atv.tabs.includes('keys'));
 assert(!cards['media_player.speaker'].custom_fields.panel);
 const tv=cards['media_player.saloon_tv'];
 assert.equal(tv.name,'Saloon TV');assert.equal(tv.icon,'mdi:television');
 const playing=tvHass().states;Object.assign(playing['media_player.saloon_tv'],{state:'playing'});Object.assign(playing['media_player.saloon_tv'].attributes,{media_title:'Episode 3',media_series_title:'The Show',entity_picture:'/api/x.jpg'});
 const now=runField(tv,'now',playing);
 assert(now.includes('Playing')&&now.includes('Episode 3')&&now.includes('The Show')&&now.includes('YouTube'));
 const offNow=tvHass().states;for(const p of ['media_player.saloon_tv','media_player.saloon_tv_adb','media_player.saloon_cast'])offNow[p].state='off';
 assert(runField(tv,'now',offNow).includes('The TV is off.'));
});
test('a TV seen through Android TV Remote, ADB and a speaker entry uses the entry that is on',()=>{
 const E=(entity_id,platform,device_id,area_id)=>({entity_id,platform,device_id,area_id});
 const st=(state,attributes)=>({state,attributes});
 const states={
  'media_player.saloon_saloon_tv':st('on',{app_id:'com.google.android.youtube.tv',app_name:'com.google.android.youtube.tv',device_class:'tv',friendly_name:'Saloon TV',supported_features:153529}),
  'media_player.saloon_saloon_tv_adb':st('off',{device_class:'tv',friendly_name:'Saloon TV ADB',supported_features:23997}),
  'media_player.saloon_tv_2':st('paused',{media_title:'Home Assistant',friendly_name:'Saloon TV(192.168.14.187) Saloon TV(192.168.14.246)'}),
  'remote.saloon_saloon_tv_adb':st('unknown',{friendly_name:'Saloon TV ADB'}),
  'remote.saloon_tv':st('on',{activity_list:[],current_activity:'com.google.android.youtube.tv',friendly_name:'Saloon TV'})};
 const entities={
  'media_player.saloon_saloon_tv':E('media_player.saloon_saloon_tv','androidtv_remote','dA','saloon'),
  'remote.saloon_tv':E('remote.saloon_tv','androidtv_remote','dA2','saloon'),
  'media_player.saloon_saloon_tv_adb':E('media_player.saloon_saloon_tv_adb','androidtv','dB','saloon'),
  'remote.saloon_saloon_tv_adb':E('remote.saloon_saloon_tv_adb','androidtv','dB','saloon'),
  'media_player.saloon_tv_2':E('media_player.saloon_tv_2','dlna_dmr','dC','saloon')};
 const hass={states,services:{browser_mod:{popup:{}}},areas:{saloon:{area_id:'saloon',name:'Saloon',labels:[]}},floors:{},labels:{},devices:{},entities};
 const d=generateOriginal(ORIGINAL_TEMPLATE,SLOTS,ROOM_TEMPLATES,{dashboard_path:'/x',area_rooms:true,room_controls:true,auto_discover:true},hass);
 const cards=[];const find=x=>{if(x&&typeof x==='object'){if(x.custom_fields?.media&&x.entity)cards.push(x);Object.values(x).forEach(find);}};find(d.views.find(v=>v.path==='rooms'));
 assert.equal(cards.length,1);
 const tv=cards[0];
 assert.equal(tv.entity,'media_player.saloon_saloon_tv');
 assert.equal(Function('states',tv.label.trim().slice(3,-3))(states),'On, YouTube');
 const p=panel(tv,states);
 assert(p.calls.some(c=>c[1]==='send_command'&&c[2].entity_id==='remote.saloon_tv'&&c[2].command==='DPAD_CENTER'));
 assert(p.names('apps-pane').includes('Netflix'));
 assert(p.calls.some(c=>c[1]==='turn_on'&&c[2].activity==='com.netflix.ninja'));
 assert.deepEqual(p.names('sources'),['Home','HDMI 1','HDMI 2','HDMI 3','HDMI 4','Inputs']);
 const now=runField(tv,'now',states);
 assert(now.includes('YouTube')&&!now.includes('Paused'));
});
