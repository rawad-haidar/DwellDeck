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
const outside=d=>d.views[0].sections.find(s=>s.cards[0].heading==='Outside');
test('Home opens with the house at a glance, the sky has its own section, information cards are not boxed',()=>{
 const d=generate({});
 const first=d.views[0].sections[0].cards;
 assert(first[0].custom_fields?.glance);
 const sky=outside(d).cards[1];
 assert(sky.custom_fields?.sky||sky.content==='Select an entity in DwellDeck setup.');
 const bound=generate({entities:Object.fromEntries(SLOTS.filter(s=>s.domain==='weather').map(s=>[s.key,'weather.home']))});
 assert(outside(bound).cards[1].custom_fields?.sky);
 assert(!first.some(c=>c.type==='heading'&&c.heading==='Welcome home'));
 assert(!JSON.stringify(first).includes('☀️'));
 const markdown=[];const find=x=>{if(x&&typeof x==='object'){if(x.type==='markdown')markdown.push(x);Object.values(x).forEach(find);}};find(d);
 assert(markdown.length&&markdown.every(c=>JSON.stringify(c.card_mod).includes('background:transparent!important')));
});
test('the readable font can be switched off',()=>{
 assert(JSON.stringify(generate({})).includes('Atkinson Hyperlegible Next'));
 assert(!JSON.stringify(generate({font:'system'})).includes('Atkinson Hyperlegible Next'));
});
test('Home weather is the live hero card in the Outside section',()=>{
 const key=SLOTS.find(s=>s.placeholder==='weather.dwelldeck_slot_295').key;
 const d=generate({entities:{[key]:'weather.home'}});
 assert.equal(d.views[0].sections[0].column_span,2);
 const card=outside(d).cards[1];
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
const runField=(card,field,states)=>{globalThis.window=globalThis.window||{};globalThis.window.__dwellTvApps={};const t=card.custom_fields[field].trim().slice(3,-3);return Function('states',t)(states);};
const unescape=v=>v.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const panel=(card,states=tvHass().states)=>{
 const html=runField(card,'panel',states);
 return {html,tabs:[...html.matchAll(/class="tab" data-tab="([^"]+)"/g)].map(m=>m[1]),
  calls:[...html.matchAll(/data-call="([^"]*)"/g)].map(m=>JSON.parse(unescape(m[1]))),
  names:pane=>[...(html.split(`class="pane ${pane}"`)[1]||'').split('class="pane ')[0].matchAll(/<span>([^<]*)<\/span>/g)].map(m=>unescape(m[1])).filter(n=>n!=='Refresh installed apps')};
};
test('each TV is one compact card with Remote, Apps, Sources and Keyboard tabs and no popups',()=>{
 const cards=tvCards();
 assert.deepEqual(Object.keys(cards).sort(),['media_player.atv','media_player.bedroom_adb','media_player.saloon_tv','media_player.speaker']);
 for(const card of Object.values(cards))assert(!JSON.stringify(card).includes('browser_mod'));
 const saloon=panel(cards['media_player.saloon_tv']);
 assert.deepEqual(saloon.tabs,['remote','apps','sources','keys']);
 const commands=saloon.calls.filter(c=>c[1]==='send_command').map(c=>c[2].command);
 for(const c of ['DPAD_UP','DPAD_CENTER','BACK','HOME','MENU','MUTE'])assert(commands.includes(c),c);
 assert.deepEqual(saloon.names('apps-pane'),['Netflix','YouTube']);
 assert.deepEqual(saloon.names('sources'),['HDMI 1','HDMI 2','Home']);
 assert(saloon.html.includes('class="dw-kb"'));
 const bedroom=cards['media_player.bedroom_adb'];
 const adb=panel(bedroom);
 assert(adb.calls.some(c=>c[0]==='androidtv'&&c[1]==='adb_command'&&c[2].command==='CENTER'));
 assert(!adb.calls.some(c=>c[1]==='send_command'));
 assert.deepEqual(adb.names('apps-pane'),[]);
 assert(adb.html.includes('press Refresh to load the apps installed'));
 assert(!adb.tabs.includes('keys'));
 const off=tvHass().states;off['media_player.bedroom_adb'].state='off';off['media_player.bedroom_adb'].attributes.source_list=[];
 assert(panel(bedroom,off).html.includes('Turn the TV on'));
 const live=tvHass().states;live['media_player.bedroom_adb'].attributes.source_list=['com.netflix.ninja','HDMI 4'];
 assert.deepEqual(panel(bedroom,live).names('apps-pane'),[]);
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
 assert.deepEqual(p.names('sources'),['Home','Live TV','HDMI 1','HDMI 2','HDMI 3','HDMI 4','Inputs']);
 const now=runField(tv,'now',states);
 assert(now.includes('YouTube')&&!now.includes('Paused'));
});
test('a TV whose integration is unknown still gets its remote, keyboard and status from what it reports',()=>{
 const E=(entity_id,platform,device_id,area_id)=>({entity_id,platform,device_id,area_id});
 const st=(state,attributes)=>({state,attributes});
 const states={
  'media_player.saloon_saloon_tv':st('on',{app_id:'com.google.android.youtube.tv',app_name:'com.google.android.youtube.tv',device_class:'tv',friendly_name:'Saloon TV',supported_features:153529}),
  'media_player.saloon_saloon_tv_adb':st('off',{device_class:'tv',friendly_name:'Saloon TV ADB',supported_features:23997}),
  'media_player.saloon_tv_2':st('paused',{media_title:'Home Assistant',friendly_name:'Saloon TV(192.168.14.187) Saloon TV(192.168.14.246)',supported_features:479807}),
  'remote.saloon_saloon_tv_adb':st('unknown',{friendly_name:'Saloon TV ADB'}),
  'remote.saloon_tv':st('on',{activity_list:[],current_activity:'com.google.android.youtube.tv',friendly_name:'Saloon TV',supported_features:4})};
 const entities={
  'media_player.saloon_saloon_tv':E('media_player.saloon_saloon_tv','some_tv_integration','dA','saloon'),
  'remote.saloon_tv':E('remote.saloon_tv','some_tv_integration','dA','saloon'),
  'media_player.saloon_saloon_tv_adb':E('media_player.saloon_saloon_tv_adb','androidtv','dB','saloon'),
  'remote.saloon_saloon_tv_adb':E('remote.saloon_saloon_tv_adb','androidtv','dB','saloon'),
  'media_player.saloon_tv_2':E('media_player.saloon_tv_2','dlna_dmr','dC','saloon')};
 const hass={states,services:{browser_mod:{popup:{}}},areas:{saloon:{area_id:'saloon',name:'Saloon',labels:[]}},floors:{},labels:{},devices:{},entities};
 const d=generateOriginal(ORIGINAL_TEMPLATE,SLOTS,ROOM_TEMPLATES,{dashboard_path:'/x',area_rooms:true,room_controls:true,auto_discover:true},hass);
 const cards=[];const find=x=>{if(x&&typeof x==='object'){if(x.custom_fields?.media&&x.entity)cards.push(x);Object.values(x).forEach(find);}};find(d.views.find(v=>v.path==='rooms'));
 assert.equal(cards.length,1);
 const tv=cards[0];
 assert.equal(tv.entity,'media_player.saloon_saloon_tv');
 assert.equal(tv.name,'Saloon TV');
 assert.equal(Function('states',tv.label.trim().slice(3,-3))(states),'On, YouTube');
 const p=panel(tv,states);
 assert.deepEqual(p.tabs,['remote','apps','sources','keys']);
 assert(p.calls.some(c=>c[1]==='send_command'&&c[2].entity_id==='remote.saloon_tv'&&c[2].command==='DPAD_UP'));
 assert(!p.calls.some(c=>c[0]==='androidtv'&&/^[A-Z_]+$/.test(c[2].command)));
 assert(p.names('apps-pane').includes('Netflix'));
 assert(p.names('sources').includes('HDMI 1'));
 const now=runField(tv,'now',states);
 assert(now.includes('YouTube')&&!now.includes('Paused')&&!now.includes('Home Assistant'));
 assert(tv.custom_fields.media.card.custom_fields.up.card.tap_action.target.entity_id==='media_player.saloon_saloon_tv');
 const power=tv.custom_fields.power.card.tap_action;
 assert.equal(power.perform_action,'media_player.toggle');assert.equal(power.target.entity_id,'media_player.saloon_saloon_tv');
});
test('power goes to an entry that can turn on and off, else to the TV remote',()=>{
 const E=(entity_id,platform,device_id,area_id)=>({entity_id,platform,device_id,area_id});
 const states={'media_player.den_tv':{state:'on',attributes:{friendly_name:'Den TV',supported_features:479807}},
  'remote.den_tv':{state:'on',attributes:{friendly_name:'Den TV',current_activity:'x'}}};
 const hass={states,services:{browser_mod:{popup:{}}},areas:{den:{area_id:'den',name:'Den',labels:[]}},floors:{},labels:{},devices:{},
  entities:{'media_player.den_tv':E('media_player.den_tv','dlna_dmr','d1','den'),'remote.den_tv':E('remote.den_tv','x','d2','den')}};
 const d=generateOriginal(ORIGINAL_TEMPLATE,SLOTS,ROOM_TEMPLATES,{dashboard_path:'/x',area_rooms:true,room_controls:true,auto_discover:true},hass);
 const cards=[];const find=x=>{if(x&&typeof x==='object'){if(x.custom_fields?.media&&x.entity)cards.push(x);Object.values(x).forEach(find);}};find(d.views.find(v=>v.path==='rooms'));
 const power=cards[0].custom_fields.power.card.tap_action;
 assert.equal(power.perform_action,'remote.toggle');assert.equal(power.target.entity_id,'remote.den_tv');
});
test('a hidden TV entry still leads its card, and a TV never gets two cards',()=>{
 const E=(entity_id,platform,device_id,area_id,extra={})=>({entity_id,platform,device_id,area_id,...extra});
 const st=(state,attributes)=>({state,attributes});
 const states={
  'media_player.saloon_saloon_tv':st('on',{app_name:'com.google.android.youtube.tv',device_class:'tv',friendly_name:'Saloon TV',supported_features:153529}),
  'media_player.saloon_saloon_tv_adb':st('off',{device_class:'tv',friendly_name:'Saloon TV ADB',supported_features:23997}),
  'media_player.saloon_tv_2':st('paused',{media_title:'Home Assistant',friendly_name:'Saloon TV(192.168.14.187) Saloon TV(192.168.14.246)',supported_features:479807}),
  'remote.saloon_tv':st('on',{activity_list:[],current_activity:'com.google.android.youtube.tv',friendly_name:'Saloon TV'})};
 const entities={
  'media_player.saloon_saloon_tv':E('media_player.saloon_saloon_tv','x','dA','saloon',{hidden_by:'user'}),
  'remote.saloon_tv':E('remote.saloon_tv','x','dA','saloon'),
  'media_player.saloon_saloon_tv_adb':E('media_player.saloon_saloon_tv_adb','androidtv','dB','saloon'),
  'media_player.saloon_tv_2':E('media_player.saloon_tv_2','dlna_dmr','dC','saloon')};
 const hass={states,services:{browser_mod:{popup:{}}},areas:{saloon:{area_id:'saloon',name:'Saloon',labels:[]}},floors:{},labels:{},devices:{},entities};
 const d=generateOriginal(ORIGINAL_TEMPLATE,SLOTS,ROOM_TEMPLATES,{dashboard_path:'/x',area_rooms:true,room_controls:true,auto_discover:true},hass);
 const cards=[];const find=x=>{if(x&&typeof x==='object'){if(x.custom_fields?.media&&x.entity)cards.push(x);Object.values(x).forEach(find);}};find(d.views.find(v=>v.path==='rooms'));
 assert.equal(cards.length,1);
 const tv=cards[0];
 assert.equal(tv.entity,'media_player.saloon_saloon_tv');
 assert.equal(tv.custom_fields.power.card.tap_action.target.entity_id,'media_player.saloon_saloon_tv');
 assert.equal(tv.custom_fields.media.card.custom_fields.play.card.tap_action.target.entity_id,'media_player.saloon_saloon_tv');
 assert(panel(tv,states).calls.some(c=>c[2].entity_id==='remote.saloon_tv'&&c[2].command==='DPAD_UP'));
});
test('installed apps come from ADB, are remembered, and drop out only when a new list no longer has them',()=>{
 const cards=tvCards();const bedroom=cards['media_player.bedroom_adb'];
 globalThis.window.__dwellTvApps={};
 const run=states=>Function('states',bedroom.custom_fields.panel.trim().slice(3,-3))(states);
 const names=(html,pane)=>[...(html.split(`class="pane ${pane}"`)[1]||'').split('class="pane ')[0].matchAll(/<span>([^<]*)<\/span>/g)].map(m=>m[1]).filter(n=>n!=='Refresh installed apps');
 const base=tvHass().states;
 const first=run(base);
 assert(first.includes('data-fetch='));
 assert(first.includes('query-activities'));
 const answer=tvHass().states;answer['media_player.bedroom_adb'].attributes.adb_response='com.netflix.ninja/.MainActivity\ncom.google.android.youtube.tv/com.google.android.apps.youtube.tv.activity.ShellActivity\ncom.google.android.tvlauncher/.MainActivity\npackage:net.mbc.shahid.androidtv\npackage:com.android.systemui';
 assert.deepEqual(names(run(answer),'apps-pane'),['Netflix','Shahid','YouTube']);
 const running=tvHass().states;running['media_player.bedroom_adb'].attributes.adb_response=null;running['media_player.bedroom_adb'].attributes.source_list=['com.google.android.youtube.tv'];
 assert.deepEqual(names(run(running),'apps-pane'),['Netflix','Shahid','YouTube']);
 const removed=tvHass().states;removed['media_player.bedroom_adb'].attributes.adb_response='package:com.netflix.ninja';
 assert.deepEqual(names(run(removed),'apps-pane'),['Netflix']);
 assert(run(removed).includes('monkey -p com.netflix.ninja'));
 globalThis.window.__dwellTv.open['media_player.bedroom_adb']='apps';
 assert(run(removed).includes('data-open="apps"'));
});
test('an ADB-only TV gets HDMI, Live TV and input keys as ADB key events',()=>{
 const states={'media_player.rest_area_living_tv':{state:'on',attributes:{friendly_name:'Living Tv',device_class:'tv',supported_features:23997}}};
 const hass={states,services:{browser_mod:{popup:{}}},areas:{rest:{area_id:'rest',name:'Rest Area',labels:[]}},floors:{},labels:{},devices:{},
  entities:{'media_player.rest_area_living_tv':{entity_id:'media_player.rest_area_living_tv',platform:'androidtv',device_id:'d1',area_id:'rest'}}};
 const d=generateOriginal(ORIGINAL_TEMPLATE,SLOTS,ROOM_TEMPLATES,{dashboard_path:'/x',area_rooms:true,room_controls:true,auto_discover:true},hass);
 const cards=[];const find=x=>{if(x&&typeof x==='object'){if(x.custom_fields?.media&&x.entity)cards.push(x);Object.values(x).forEach(find);}};find(d.views.find(v=>v.path==='rooms'));
 const p=panel(cards[0],states);
 assert(p.tabs.includes('sources'));
 assert.deepEqual(p.names('sources'),['Home','Live TV','HDMI 1','HDMI 2','HDMI 3','HDMI 4','Inputs']);
 assert(p.calls.some(c=>c[0]==='androidtv'&&c[2].command==='input keyevent KEYCODE_TV_INPUT_HDMI_2'));
 assert(p.calls.some(c=>c[0]==='androidtv'&&c[2].command==='input keyevent KEYCODE_TV'));
});
test('a TV that lists only its home screen as a source still gets HDMI and Live TV keys',()=>{
 const states={'media_player.den_tv':{state:'on',attributes:{friendly_name:'Den TV',device_class:'tv',supported_features:23997,source_list:['Google TV Launcher','Netflix']}}};
 const hass={states,services:{browser_mod:{popup:{}}},areas:{den:{area_id:'den',name:'Den',labels:[]}},floors:{},labels:{},devices:{},
  entities:{'media_player.den_tv':{entity_id:'media_player.den_tv',platform:'androidtv',device_id:'d1',area_id:'den'}}};
 const d=generateOriginal(ORIGINAL_TEMPLATE,SLOTS,ROOM_TEMPLATES,{dashboard_path:'/x',area_rooms:true,room_controls:true,auto_discover:true},hass);
 const cards=[];const find=x=>{if(x&&typeof x==='object'){if(x.custom_fields?.media&&x.entity)cards.push(x);Object.values(x).forEach(find);}};find(d.views.find(v=>v.path==='rooms'));
 assert.deepEqual(panel(cards[0],states).names('sources'),['Home','Live TV','HDMI 1','HDMI 2','HDMI 3','HDMI 4','Inputs']);
});
test('a real TCL Google TV app list from ADB gives readable apps and Live TV in Sources',async()=>{
 const fs=await import('node:fs');
 const response=fs.readFileSync(new URL('./fixtures/tcl-adb-apps.txt',import.meta.url),'utf8');
 const states={'media_player.rest_area_living_tv':{state:'on',attributes:{friendly_name:'Living Tv',device_class:'tv',supported_features:23997,adb_response:response}}};
 const hass={states,services:{browser_mod:{popup:{}}},areas:{rest:{area_id:'rest',name:'Rest Area',labels:[]}},floors:{},labels:{},devices:{},
  entities:{'media_player.rest_area_living_tv':{entity_id:'media_player.rest_area_living_tv',platform:'androidtv',device_id:'d1',area_id:'rest'}}};
 const d=generateOriginal(ORIGINAL_TEMPLATE,SLOTS,ROOM_TEMPLATES,{dashboard_path:'/x',area_rooms:true,room_controls:true,auto_discover:true},hass);
 const cards=[];const find=x=>{if(x&&typeof x==='object'){if(x.custom_fields?.media&&x.entity)cards.push(x);Object.values(x).forEach(find);}};find(d.views.find(v=>v.path==='rooms'));
 const p=panel(cards[0],states);
 const apps=p.names('apps-pane');
 for(const name of ['Netflix','YouTube','Shahid','TOD','Disney+','Prime Video','Spotify','Play Store','Settings'])assert(apps.includes(name),name);
 for(const name of ['Mea','ShahidTV','Tcl','Instructions','Suspension','Dashboard','Exhibit','Guard','Overseas'])assert(!apps.includes(name),name);
 assert.deepEqual(p.names('sources'),['Home','Live TV','HDMI 1','HDMI 2','HDMI 3','Inputs']);
 assert(p.calls.some(c=>c[0]==='androidtv'&&c[2].command==='am start -a android.intent.action.VIEW -d "content://android.media.tv/passthrough/com.tcl.tvinput%2F.TvPassThroughService%2FHW15"'));
 assert(p.calls.some(c=>c[0]==='androidtv'&&c[2].command.startsWith('monkey -p com.tcl.tv ')));
});
test('the power button is plain when the TV is off and orange when it is on, matching the status',()=>{
 const make=state=>({'media_player.kitchen_tv':{state,attributes:{friendly_name:'Kitchen Tv',device_class:'tv',supported_features:153529}}});
 const hass={states:make('off'),services:{browser_mod:{popup:{}}},areas:{k:{area_id:'k',name:'Kitchen',labels:[]}},floors:{},labels:{},devices:{},
  entities:{'media_player.kitchen_tv':{entity_id:'media_player.kitchen_tv',platform:'cast',device_id:'d1',area_id:'k'}}};
 const d=generateOriginal(ORIGINAL_TEMPLATE,SLOTS,ROOM_TEMPLATES,{dashboard_path:'/x',area_rooms:true,room_controls:true,auto_discover:true},hass);
 const cards=[];const find=x=>{if(x&&typeof x==='object'){if(x.custom_fields?.media&&x.entity)cards.push(x);Object.values(x).forEach(find);}};find(d.views.find(v=>v.path==='rooms'));
 const power=cards[0].custom_fields.power.card;
 const style=(states,key)=>{const t=power.styles.card.find(o=>key in o)[key];return Function('states','entity',t.trim().slice(3,-3))(states,states['media_player.kitchen_tv']);};
 const label=states=>Function('states',cards[0].label.trim().slice(3,-3))(states);
 assert.equal(style(make('off'),'background'),'transparent');assert.equal(label(make('off')),'Off');
 assert.notEqual(style(make('on'),'background'),'transparent');assert.equal(label(make('on')),'On');
 assert.deepEqual(power.triggers_update,['media_player.kitchen_tv']);
});
test('a TCL TV with Android TV Remote opens HDMI through remote.turn_on and pairs the room\'s only remote',()=>{
 const states={'media_player.rest_area_living_tv':{state:'on',attributes:{friendly_name:'Living Tv',device_class:'tv',supported_features:153529}},
  'remote.rest_area_living_2f_tv_pro':{state:'on',attributes:{friendly_name:'Living 2F TV Pro',current_activity:'com.tcl.tv',activity_list:[]}}};
 const hass={states,services:{browser_mod:{popup:{}}},areas:{rest:{area_id:'rest',name:'Rest Area',labels:[]}},floors:{},labels:{},
  devices:{d1:{id:'d1',area_id:'rest',manufacturer:'TCL'},d2:{id:'d2',area_id:'rest',manufacturer:'TCL'}},
  entities:{'media_player.rest_area_living_tv':{entity_id:'media_player.rest_area_living_tv',platform:'cast',device_id:'d1'},
   'remote.rest_area_living_2f_tv_pro':{entity_id:'remote.rest_area_living_2f_tv_pro',platform:'androidtv_remote',device_id:'d2'}}};
 const d=generateOriginal(ORIGINAL_TEMPLATE,SLOTS,ROOM_TEMPLATES,{dashboard_path:'/x',area_rooms:true,room_controls:true,auto_discover:true},hass);
 const cards=[];const find=x=>{if(x&&typeof x==='object'){if(x.custom_fields?.media&&x.entity)cards.push(x);Object.values(x).forEach(find);}};find(d.views.find(v=>v.path==='rooms'));
 const p=panel(cards[0],states);
 assert(p.calls.some(c=>c[0]==='remote'&&c[1]==='turn_on'&&c[2].entity_id==='remote.rest_area_living_2f_tv_pro'&&c[2].activity==='content://android.media.tv/passthrough/com.tcl.tvinput%2F.TvPassThroughService%2FHW15'));
 assert(p.calls.some(c=>c[1]==='turn_on'&&c[2].activity==='com.tcl.tv'));
 assert(p.calls.some(c=>c[1]==='send_command'&&c[2].command==='DPAD_UP'));
});
test('room cards show a summary, status chips and a lights button; rooms open with a status strip',async()=>{
 const st=(state,attributes)=>({state,attributes});
 const states={'light.saloon_a':st('on',{friendly_name:'A'}),'light.saloon_b':st('off',{friendly_name:'B'}),
  'sensor.saloon_temp':st('26.9',{device_class:'temperature',unit_of_measurement:'°C',friendly_name:'Saloon Temp'}),
  'sensor.saloon_hum':st('55',{device_class:'humidity',unit_of_measurement:'%',friendly_name:'Saloon Humidity'}),
  'binary_sensor.saloon_motion':st('on',{device_class:'motion',friendly_name:'Saloon Motion'}),
  'climate.saloon_ac':st('cool',{hvac_action:'cooling',temperature:22,friendly_name:'Saloon AC',hvac_modes:['off','cool']}),
  'media_player.saloon_tv':st('on',{device_class:'tv',friendly_name:'Saloon TV'})};
 const E=id=>({entity_id:id,area_id:id.includes('kitchen_tv')||id.includes('kitchen_kitch')?'kitchen':undefined,platform:'x',device_id:'d',area_id:'saloon'});
 const hass={states,services:{browser_mod:{popup:{}}},areas:{saloon:{area_id:'saloon',name:'Saloon',labels:[]}},floors:{},labels:{},devices:{d:{id:'d',area_id:'saloon'}},
  entities:Object.fromEntries(Object.keys(states).map(id=>[id,E(id)]))};
 const d=generateOriginal(ORIGINAL_TEMPLATE,SLOTS,ROOM_TEMPLATES,{dashboard_path:'/x',area_rooms:true,room_controls:true,auto_discover:true},hass);
 const rooms=d.views.find(v=>v.path==='rooms');
 let card;const find=x=>{if(x&&typeof x==='object'){if(x.name==='Saloon'&&x.tap_action?.browser_mod)card=x;Object.values(x).forEach(find);}};find(rooms);
 assert(card);
 assert.equal(Function('states',card.label.trim().slice(3,-3))(states),'1 of 2 lights on');
 globalThis.window=globalThis.window||{};
 const chips=Function('states',card.custom_fields.chips.trim().slice(3,-3))(states).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
 for(const text of ['26.9°C','Cooling 22°','TV on','Motion'])assert(chips.indexOf(text)<chips.indexOf('55%'),text);
 assert(card.styles.card.some(o=>o.height==='128px'));
 assert(Function('states',card.custom_fields.chips.trim().slice(3,-3))(states).includes('height:28px;overflow:hidden'));
 const strip=card.tap_action.browser_mod.data.content.cards[0];
 const stripText=Function('states',strip.custom_fields.chips.trim().slice(3,-3))(states).replace(/<[^>]+>/g,' ');
 for(const text of ['26.9°C','55%','Cooling 22°','TV on','Motion'])assert(stripText.includes(text),text);
 const slot=card.custom_fields.power.card.cards;
 assert.deepEqual(slot[0].card.tap_action.dwelldeck_lights?.service,'turn_off');
 assert.equal(slot[0].card.tap_action.action,'fire-dom-event');
 assert.equal(slot[0].conditions[0].condition,'or');
 assert.deepEqual(slot[1].card.tap_action.dwelldeck_lights?.service,'turn_on');
 assert(slot[1].conditions.every(c=>c.state_not==='on'));
 assert(!JSON.stringify(slot).includes('[[['),'no code in the room card\'s lights button');
 // Off goes only to lights that are on; on only to reachable lights that are off.
 const {dwellSwitchLights}=await import('../src/strategy.mjs');
 const sent=async(button,st)=>{const ids=[];await dwellSwitchLights(button.tap_action.dwelldeck_lights,{states:st,callService:async(d,s,data)=>{ids.push(data.entity_id)}},()=>{},async()=>{});return ids;};
 assert.deepEqual(await sent(slot[0].card,states),['light.saloon_a']);
 const offline={...states,'light.saloon_a':{state:'off',attributes:{}},'light.saloon_b':{state:'unavailable',attributes:{}}};
 assert.deepEqual(await sent(slot[1].card,offline),['light.saloon_a']);
 assert(!card.custom_fields.powerOn);
 assert(card.styles.grid[0]['grid-template-areas'].includes('power'));
 const content=card.tap_action.browser_mod.data.content.cards;
 assert(content[0].custom_fields?.chips,'status strip first');
 const headings=content.filter(c=>c.type==='heading').map(c=>c.heading);
 assert(headings.indexOf('Climate')<headings.indexOf('TVs'));
 assert(headings.indexOf('TVs')<headings.indexOf('All sensors'));
});
test('room temperature averages the room\'s sensors, or the sensors chosen for the room',()=>{
 const st=(state,attributes)=>({state,attributes});
 const states={'light.den_a':st('off',{}),
  'sensor.den_t1':st('26',{device_class:'temperature',unit_of_measurement:'°C'}),'sensor.den_t2':st('22',{device_class:'temperature',unit_of_measurement:'°C'}),
  'sensor.den_t3':st('unavailable',{device_class:'temperature',unit_of_measurement:'°C'}),
  'sensor.hall_t':st('19',{device_class:'temperature',unit_of_measurement:'°C'})};
 const E=(id,area)=>({entity_id:id,area_id:id.includes('kitchen_tv')||id.includes('kitchen_kitch')?'kitchen':undefined,platform:'x',area_id:area});
 const hass={states,services:{browser_mod:{popup:{}}},areas:{den:{area_id:'den',name:'Den',labels:[]},hall:{area_id:'hall',name:'Hall',labels:[]}},floors:{},labels:{},devices:{},
  entities:{'light.den_a':E('light.den_a','den'),'sensor.den_t1':E('sensor.den_t1','den'),'sensor.den_t2':E('sensor.den_t2','den'),'sensor.den_t3':E('sensor.den_t3','den'),'sensor.hall_t':E('sensor.hall_t','hall')}};
 const den=config=>{
  const d=generateOriginal(ORIGINAL_TEMPLATE,SLOTS,ROOM_TEMPLATES,{dashboard_path:'/x',area_rooms:true,room_controls:true,auto_discover:true,...config},hass);
  let card;const find=x=>{if(x&&typeof x==='object'){if(x.name==='Den'&&x.tap_action?.browser_mod)card=x;Object.values(x).forEach(find);}};find(d.views.find(v=>v.path==='rooms'));
  return Function('states',card.custom_fields.chips.trim().slice(3,-3))(states).replace(/<[^>]+>/g,' ');
 };
 assert(den({}).includes('24°C'),'average of 26 and 22, unavailable skipped');
 const manual=den({rooms:{den:{name:'Den',area:'den',temperature_sensors:['sensor.den_t1','sensor.hall_t']}}});
 assert(manual.includes('22.5°C'),'average of the chosen sensors');
 states['climate.den_ac']=st('cool',{current_temperature:25,temperature:22,hvac_action:'cooling'});
 hass.entities['climate.den_ac']=E('climate.den_ac','den');
 assert(den({rooms:{den:{name:'Den',area:'den',temperature_sensors:['climate.den_ac','sensor.den_t2']}}}).includes('23.5'),'an air conditioner counts with its current temperature');
 for(const id of ['sensor.den_t1','sensor.den_t2','sensor.den_t3']){delete states[id];delete hass.entities[id];}
 assert(den({}).includes('25'),'a room without sensors uses its air conditioner');
});
test('a TV that is off shows Off even when a cast entry of it keeps playing',()=>{
 const E=(entity_id,platform,device_id,area_id)=>({entity_id,platform,device_id,area_id});
 const st=(state,attributes)=>({state,attributes});
 const states={
  'media_player.saloon_saloon_tv':st('off',{device_class:'tv',friendly_name:'Saloon TV',assumed_state:true,supported_features:153529}),
  'media_player.saloon_saloon_tv_adb':st('off',{device_class:'tv',friendly_name:'Saloon TV ADB',supported_features:23997}),
  'media_player.saloon_tv_2':st('playing',{media_title:'Home Assistant',friendly_name:'Saloon TV(192.168.14.187) Saloon TV(192.168.14.246)',supported_features:479807}),
  'remote.saloon_tv':st('off',{activity_list:[],current_activity:null,friendly_name:'Saloon TV'})};
 const entities={'media_player.saloon_saloon_tv':E('media_player.saloon_saloon_tv','x','dA','saloon'),'remote.saloon_tv':E('remote.saloon_tv','x','dA','saloon'),
  'media_player.saloon_saloon_tv_adb':E('media_player.saloon_saloon_tv_adb','androidtv','dB','saloon'),'media_player.saloon_tv_2':E('media_player.saloon_tv_2','dlna_dmr','dC','saloon')};
 const hass={states,services:{browser_mod:{popup:{}}},areas:{saloon:{area_id:'saloon',name:'Saloon',labels:[]}},floors:{},labels:{},devices:{},entities};
 const d=generateOriginal(ORIGINAL_TEMPLATE,SLOTS,ROOM_TEMPLATES,{dashboard_path:'/x',area_rooms:true,room_controls:true,auto_discover:true},hass);
 const cards=[];const find=x=>{if(x&&typeof x==='object'){if(x.custom_fields?.media&&x.entity)cards.push(x);Object.values(x).forEach(find);}};find(d.views.find(v=>v.path==='rooms'));
 const tv=cards[0];
 assert.equal(Function('states',tv.label.trim().slice(3,-3))(states),'Off');
 assert(runField(tv,'now',states).includes('The TV is off.'));
 const bg=tv.custom_fields.power.card.styles.card.find(o=>'background' in o).background;
 assert.equal(Function('states','entity',bg.trim().slice(3,-3))(states,states[tv.entity]),'transparent');
});
test('home is ordered by importance and shows rooms only while something in them is on',()=>{
 const st=(state,attributes={})=>({state,attributes});
 const states={'light.den_a':st('on'),'media_player.den_tv':st('off',{device_class:'tv'}),'climate.den_ac':st('off'),'weather.home':st('sunny',{temperature:20})};
 const hass={states,services:{browser_mod:{popup:{}}},areas:{den:{area_id:'den',name:'Den',labels:[]}},floors:{},labels:{},devices:{},
  entities:Object.fromEntries(Object.keys(states).map(id=>[id,{entity_id:id,area_id:'den'}]))};
 const d=generateOriginal(ORIGINAL_TEMPLATE,SLOTS,ROOM_TEMPLATES,{dashboard_path:'/x',area_rooms:true,room_controls:true,auto_discover:true},hass);
 const home=d.views.find(v=>v.path==='home');
 assert.deepEqual(home.sections.map(s=>s.cards[0].heading||s.cards[0].custom_fields&&Object.keys(s.cards[0].custom_fields)[0]),['glance','Outside','Safety','Energy and climate','Shortcuts']);
 assert.equal(home.sections[0].column_span,2);
 const den=home.sections[0].cards.find(c=>c.name==='Den');
 assert(den.visibility[0].conditions.some(c=>c.entity==='light.den_a'&&c.state==='on'));
 const quiet=home.sections[0].cards.find(c=>c.name==='Everything is off');
 assert(quiet.visibility[0].conditions.some(c=>c.entity==='light.den_a'&&c.state_not==='on'));
 const shortcuts=home.sections[4].cards.slice(1);
 assert(shortcuts.length>=6&&shortcuts.every(c=>c.styles.card.some(r=>r.height==='120px')));
 assert(!JSON.stringify(home).includes("now().strftime('%H:%M')"));
});
test('a room does not show Playing when only a cast entry of its TV is playing',()=>{
 const st=(id,state,a={})=>[id,{entity_id:id,state,attributes:{friendly_name:'Saloon TV',...a}}];
 const states=Object.fromEntries([st('media_player.saloon_tv','off',{device_class:'tv'}),st('media_player.saloon_tv_192_168_14_246_2','playing',{media_title:'Home Assistant'}),st('light.saloon_a','off')]);
 const entities=Object.fromEntries(Object.keys(states).map(id=>[id,{entity_id:id,area_id:'saloon',platform:id.endsWith('_2')?'dlna_dmr':'androidtv_remote'}]));
 const hass={states,services:{browser_mod:{popup:{}}},areas:{saloon:{area_id:'saloon',name:'Saloon',labels:[]}},floors:{},labels:{},devices:{},entities};
 const d=generateOriginal(ORIGINAL_TEMPLATE,SLOTS,ROOM_TEMPLATES,{dashboard_path:'/x',area_rooms:true,room_controls:true,auto_discover:true},hass);
 const card=d.views.find(v=>v.path==='rooms').sections.flatMap(s=>s.cards).find(c=>c.name==='Saloon');
 const chips=card.custom_fields.chips;
 const cfg=JSON.parse(chips.slice(chips.lastIndexOf('(states, ')+9,chips.lastIndexOf(')')));
 assert.deepEqual(cfg.media,[['media_player.saloon_tv']]);
});
test('TVs and sound systems are separate in a room, with their own chips',()=>{
 const st=(id,state,a={})=>[id,{entity_id:id,state,attributes:a}];
 const states=Object.fromEntries([st('media_player.den_tv','on',{device_class:'tv',friendly_name:'Den TV'}),st('media_player.den_speaker','playing',{friendly_name:'Den Speaker',media_title:'Song'}),st('media_player.den_pa','off',{friendly_name:'Den PA'}),st('light.den_a','off')]);
 const platform={'media_player.den_tv':'androidtv_remote','media_player.den_speaker':'sonos','media_player.den_pa':'dsppa','light.den_a':'x'};
 const entities=Object.fromEntries(Object.keys(states).map(id=>[id,{entity_id:id,area_id:'den',platform:platform[id]}]));
 const hass={states,services:{browser_mod:{popup:{}}},areas:{den:{area_id:'den',name:'Den',labels:[]}},floors:{},labels:{},devices:{},entities};
 const d=generateOriginal(ORIGINAL_TEMPLATE,SLOTS,ROOM_TEMPLATES,{dashboard_path:'/x',area_rooms:true,room_controls:true,auto_discover:true},hass);
 const card=d.views.find(v=>v.path==='rooms').sections.flatMap(s=>s.cards).find(c=>c.name==='Den');
 const content=card.tap_action.browser_mod.data.content.cards;
 const headings=content.filter(c=>c.type==='heading').map(c=>c.heading);
 assert(headings.includes('TVs')&&headings.includes('Sound systems'));
 const html=Function('states',card.custom_fields.chips.trim().slice(3,-3))(states);
 assert(html.includes('TV on')&&html.includes('Music playing'));
 const speaker=JSON.stringify(content).includes('mdi:speaker');
 assert(speaker);
});
test('a TV that is on shows what it is on (TV · Netflix), and players named Sound system are sound systems',()=>{
 const st=(id,state,a={})=>[id,{entity_id:id,state,attributes:a}];
 const states=Object.fromEntries([st('media_player.rest_area_living_tv','idle',{friendly_name:'Living Tv'}),st('remote.rest_area_living_2f_tv_pro','on',{current_activity:'com.netflix.ninja',friendly_name:'Living 2F TV Pro'}),
  st('media_player.rest_area_sound_system','playing',{friendly_name:'Rest Area Sound System'}),st('light.rest_a','off')]);
 const platform={'media_player.rest_area_living_tv':'androidtv','remote.rest_area_living_2f_tv_pro':'androidtv_remote','media_player.rest_area_sound_system':'cast','light.rest_a':'x'};
 const entities=Object.fromEntries(Object.keys(states).map(id=>[id,{entity_id:id,area_id:'rest',platform:platform[id]}]));
 const hass={states,services:{browser_mod:{popup:{}}},areas:{rest:{area_id:'rest',name:'Rest Area',labels:[]}},floors:{},labels:{},devices:{},entities};
 const d=generateOriginal(ORIGINAL_TEMPLATE,SLOTS,ROOM_TEMPLATES,{dashboard_path:'/x',area_rooms:true,room_controls:true,auto_discover:true},hass);
 const card=d.views.find(v=>v.path==='rooms').sections.flatMap(s=>s.cards).find(c=>c.name==='Rest Area');
 const html=Function('states',card.custom_fields.chips.trim().slice(3,-3))(states);
 assert(html.includes('TV on'),'idle Android TV is on');
 const netflix={...states,'media_player.rest_area_living_tv':{state:'playing',attributes:{app_id:'com.netflix.ninja'}}};
 assert(Function('states',card.custom_fields.chips.trim().slice(3,-3))(netflix).includes('TV · Netflix'),'the app the TV is on');
 const titled={...states,'media_player.rest_area_living_tv':{state:'playing',attributes:{app_id:'com.netflix.ninja',media_title:'Stranger Things: Chapter One, The Vanishing'}}};
 assert(Function('states',card.custom_fields.chips.trim().slice(3,-3))(titled).includes('TV · Netflix · Stranger Things: Chapter On…'),'and what plays, shortened');
 assert(html.includes('Music playing'),'named sound system is a speaker');
 const headings=card.tap_action.browser_mod.data.content.cards.filter(c=>c.type==='heading').map(c=>c.heading);
 assert(headings.includes('TVs')&&headings.includes('Sound systems'));
 const off={...states,'media_player.rest_area_living_tv':{state:'off',attributes:{}},'remote.rest_area_living_2f_tv_pro':{state:'off',attributes:{}},'media_player.rest_area_sound_system':{state:'idle',attributes:{}}};
 const quiet=Function('states',card.custom_fields.chips.trim().slice(3,-3))(off);
 assert(!quiet.includes('TV')&&!quiet.includes('Music'));
 const home={...states,'remote.rest_area_living_2f_tv_pro':{state:'off',attributes:{}},'media_player.rest_area_living_tv':{state:'idle',attributes:{app_name:'Google TV Launcher'}}};
 assert(Function('states',card.custom_fields.chips.trim().slice(3,-3))(home).includes('TV · Home'),'the launcher is Home');
 const bare={...home,'media_player.rest_area_living_tv':{state:'idle',attributes:{}}};
 assert(Function('states',card.custom_fields.chips.trim().slice(3,-3))(bare).includes('TV on'),'no app known: TV on');
});
test('security opens with status, alarm and gates of one height, then shortcuts, cameras and detection',()=>{
 const d=generate({});
 const v=d.views.find(x=>x.path==='security');
 const statusCard=v.sections[0].cards[1];
 assert(statusCard.custom_fields.status.includes('Needs attention'));
 assert.equal(v.sections[0].column_span,2);
 assert.deepEqual(v.sections.map(s=>s.cards[0].heading),['Status','Alarm','Gates','Shortcuts','Entrance cameras','Camera detection']);
 const top=statusCard.styles.card.find(r=>r.height).height;
 const withAlarm=generate({entities:{entity_001:'alarm_control_panel.outdoor'}}).views.find(x=>x.path==='security');
 assert(withAlarm.sections[1].cards[1].card_mod.style.includes('min-height: '+top));
 const gateCards=v.sections[2].cards.slice(1);
 assert(!gateCards.some(c=>c.type==='markdown'||String(c.label||'').includes('timer-based')),'no note under the gates');
 const tileH=Number(gateCards[0].card_mod.style.match(/height: (\d+)px/)[1]);
 const rows=gateCards.filter(c=>c.type==='tile').length;
 assert.equal(rows*tileH+8*(rows-1)<=parseInt(top),true);
 assert(parseInt(top)-(rows*tileH+8*(rows-1))<rows,'gates end on the status card line');
 assert(gateCards.find(c=>c.name==='Unlock').styles.card.some(r=>r.height===tileH+'px'));
 const gates=v.sections[2].cards;
 const unlock=gates.find(c=>c.name==='Unlock');
 assert.equal(unlock.tap_action.perform_action,'lock.unlock');
 assert(unlock.tap_action.confirmation);
 assert.equal(gates[gates.indexOf(unlock)-1].type,'tile');
 const last=v.sections.find(s=>s.cards[0].heading==='Shortcuts');
 assert.equal(last.column_span,4,'shortcuts run the full width');
 const bar=last.cards[1].custom_fields.bar;
 const html=Function('states',bar.trim().slice(3,-3))({});
 const paths=[...html.matchAll(/data-path="([^"]+)"/g)].map(m=>m[1]);
 assert(paths.length>=4,'a button per page');
 assert.equal(new Set(paths).size,paths.length,'no two buttons open the same page');
 assert(html.includes('/dashboard-test/security-sensors')&&html.includes('/dashboard-test/cameras')&&html.includes('/media-browser/'));
 assert(last.cards[1].styles.custom_fields.bar.some(r=>r['pointer-events']==='auto'));
 const st=(state,a={})=>({state,attributes:a,last_changed:new Date().toISOString()});
 const status=Function('states','hass',statusCard.custom_fields.status.trim().slice(3,-3))({'binary_sensor.smoke':st('on',{device_class:'smoke',friendly_name:'Kitchen smoke'})},{entities:{}});
 assert(status.includes('Kitchen smoke')&&status.includes('1 safety alert'));
 const clear=Function('states','hass',statusCard.custom_fields.status.trim().slice(3,-3))({},{entities:{}});
 assert(clear.includes('All clear'));
});
test('cards with buttons inside take clicks (button-card turns them off on cards that do nothing when tapped)',()=>{
 const d=generate({});
 const fields=[];JSON.stringify(d,(k,v)=>{if(v&&v.type==='custom:button-card'&&v.tap_action?.action==='none'&&v.custom_fields)for(const [name,f] of Object.entries(v.custom_fields))if(typeof f==='string'&&/onclick=/.test(f))fields.push([name,v.styles?.custom_fields?.[name]]);return v;});
 assert(fields.length>=2);
 for(const [name,styles] of fields)assert((styles||[]).some(r=>r['pointer-events']==='auto'),name+' must accept clicks');
});
test('curtain "all" buttons call real cover actions, and tiles have no invalid colour',()=>{
 const d=generate({});
 const text=JSON.stringify(d.views.find(v=>v.path==='curtains'));
 assert(!/"perform_action":"cover\.dwelldeck_slot_/.test(text),'actions are not entity slots');
 for(const action of ['cover.open_cover','cover.stop_cover','cover.close_cover'])assert(text.includes(`"perform_action":"${action}"`),action);
 assert(!JSON.stringify(d).includes('"color":"state"'));
 assert(!/"perform_action":"[a-z_]+\.dwelldeck_slot_/.test(JSON.stringify(d)),'no action anywhere is an entity slot');
 assert(JSON.stringify(d).includes('"perform_action":"media_player.media_pause"'));
});
test('sound system cards show only Sources, cards fill their row, floor names start with a capital',()=>{
 const st=(id,state,a={})=>[id,{entity_id:id,state,attributes:a}];
 const states=Object.fromEntries([st('media_player.pool_sound_system','off',{friendly_name:'Pool Sound System',source_list:['Bluetooth','Line in'],supported_features:2048}),st('media_player.bbq_sound_system','off',{friendly_name:'BBQ Sound System'}),st('light.pool_a','off')]);
 const entities=Object.fromEntries(Object.keys(states).map(id=>[id,{entity_id:id,area_id:'pool',platform:'dsppa'}]));
 const hass={states,services:{browser_mod:{popup:{}}},areas:{pool:{area_id:'pool',name:'Pool Area',floor_id:'out',labels:[]}},floors:{out:{floor_id:'out',name:'outdoor',level:0}},labels:{},devices:{},entities};
 const d=generateOriginal(ORIGINAL_TEMPLATE,SLOTS,ROOM_TEMPLATES,{dashboard_path:'/x',area_rooms:true,room_controls:true,auto_discover:true},hass);
 const media=d.views.find(v=>v.path==='media');
 const text=JSON.stringify(media);
 assert(text.includes('Outdoor · Pool Area'),'capital floor name');
 const pool=media.sections.flatMap(s=>s.cards).find(c=>c.name==='Pool Sound System');
 const panel=Function('states',pool.custom_fields.panel.trim().slice(3,-3))(states);
 assert(panel.includes('aria-label="Sources"')&&!panel.includes('aria-label="Apps"'),'sources only');
 const bbq=media.sections.flatMap(s=>s.cards).find(c=>c.name==='BBQ Sound System');
 assert(!bbq.custom_fields.panel,'no tabs without sources');
 assert(pool.styles.card.some(r=>r.height==='100%')&&pool.extra_styles.includes(':host{display:block;height:100%}'));
 assert(!JSON.stringify(d).includes('pause-circle-multiple'));
});
test('each sound system links to its Music Assistant player by name, and to the Music Assistant app',async()=>{
 const {musicAssistantPlayer}=await import('../src/tv.mjs');
 const st=(id,name,a={})=>[id,{entity_id:id,state:'idle',attributes:{friendly_name:name,...a}}];
 const mass={mass_player_type:'player'};
 const states=Object.fromEntries([st('media_player.dani_s_bedroom_daniel_dany_sound_system','Dany Sound System'),st('media_player.kitchen_kitch_kitchen_sound_system','Kitchen Sound System'),
  st('media_player.mini_kitchen_m_kit_m_kitchen_sound_system','M.Kitchen Sound System'),st('media_player.saloon_saloon_sound_system','Saloon Sound System'),st('media_player.gym_gym_sound_system','Gym Sound System'),
  st('media_player.dany','Dany',mass),st('media_player.dany_sound_system','Dany Sound System',mass),st('media_player.gym_sound_system','Gym Sound System',mass),st('media_player.kitchen','kitchen',mass),st('media_player.m_kitch','M.kitch',mass),st('media_player.saloon','saloon',mass),st('media_player.living','Living',mass),st('media_player.kitchen_tv','Kitchen TV(192.168.14.207)',mass)]);
 const dsppa=id=>!states[id].attributes.mass_player_type||/_sound_system$/.test(id);
 const entities=Object.fromEntries(Object.keys(states).map(id=>[id,{entity_id:id,area_id:id.includes('kitchen_tv')||id.includes('kitchen_kitch')?'kitchen':undefined,platform:states[id].attributes.mass_player_type?'music_assistant':'dsppa_am8328',device_id:id==='media_player.dani_s_bedroom_daniel_dany_sound_system'?'daniel':dsppa(id)?'zone':'streamer'}]));
 const hass={states,entities,devices:{daniel:{name:'Daniel',manufacturer:'DSPPA'},zone:{manufacturer:'DSPPA'},streamer:{manufacturer:'Xspeed, Inc.'}},areas:{}};
 const match=id=>musicAssistantPlayer([id],hass);
 assert.equal(match('media_player.dani_s_bedroom_daniel_dany_sound_system'),'media_player.dany_sound_system','the same-name player, as used in Music Assistant');
 assert.equal(match('media_player.kitchen_kitch_kitchen_sound_system'),'media_player.kitchen');
 assert.equal(match('media_player.mini_kitchen_m_kit_m_kitchen_sound_system'),'media_player.m_kitch');
 assert.equal(match('media_player.saloon_saloon_sound_system'),'media_player.saloon');
 assert.equal(match('media_player.gym_gym_sound_system'),'media_player.gym_sound_system','no streamer: the zone in Music Assistant');
 const {tvCard}=await import('../src/tv.mjs');
 const card=tvCard('media_player.dani_s_bedroom_daniel_dany_sound_system',hass);
 globalThis.window={};
 const html=Function('states',card.custom_fields.ma.trim().slice(3,-3))(states);
 assert(html.includes('data-entity="media_player.dany_sound_system"')&&html.includes('Music player')&&html.includes('Music Assistant</button>'));
 assert(card.styles.grid[0]['grid-template-areas'].includes('"ma ma ma"'));
 assert(card.styles.custom_fields.ma.some(r=>r['pointer-events']==='auto'));
 assert.equal(typeof window.__dwellTvMa.app,'function');
 assert(html.includes('data-name="Dany Sound System"'),'the app button carries the Music Assistant player name');
 const pushed=[];globalThis.location={pathname:'/dashboard-dwelldeck/media'};globalThis.history={pushState:(a,b,path)=>pushed.push(path)};window.dispatchEvent=()=>{};globalThis.CustomEvent=class{};
 window.__dwellTvMa.app({dataset:{}});
 assert.deepEqual(pushed,['/dashboard-dwelldeck/music-assistant'],'DwellDeck\'s own Music Assistant page');
});
test('a sound system card shows what its Music Assistant player plays, with artwork; a TV is not linked to the room\'s speakers',async()=>{
 const {tvCard,musicAssistantPlayer}=await import('../src/tv.mjs');
 const st=(id,state,a={})=>[id,{entity_id:id,state,attributes:a}];
 const states=Object.fromEntries([st('media_player.rest_living_sound_system','on',{friendly_name:'Living Sound System'}),
  st('media_player.living','playing',{friendly_name:'Living',mass_player_type:'player',media_title:'Ya Habibi',media_artist:'Elissa',app_id:'music_assistant',entity_picture:'http://192.168.14.243:8095/imageproxy/1',entity_picture_local:'/api/art/1.jpg'}),
  st('media_player.kitchen_tv','off',{friendly_name:'Kitchen Tv',device_class:'tv'}),st('media_player.kitchen','idle',{friendly_name:'kitchen',mass_player_type:'player'})]);
 const entities={'media_player.rest_living_sound_system':{platform:'dsppa_am8328',device_id:'z'},'media_player.living':{platform:'music_assistant',device_id:'s'},
  'media_player.kitchen_tv':{platform:'androidtv_remote'},'media_player.kitchen':{platform:'music_assistant',device_id:'s'}};
 const hass={states,entities,devices:{z:{manufacturer:'DSPPA'},s:{manufacturer:'Xspeed, Inc.'}},areas:{}};
 assert.equal(musicAssistantPlayer(['media_player.kitchen_tv'],hass),null,'Kitchen TV is not the kitchen speakers');
 const card=tvCard('media_player.rest_living_sound_system',hass);
 assert(card.triggers_update.includes('media_player.living'));
 const now=Function('states','entity',card.custom_fields.now.trim().slice(3,-3))(states,states['media_player.rest_living_sound_system']);
 assert(now.includes('Ya Habibi')&&now.includes('Elissa')&&now.includes('/api/art/1.jpg'),'title, artist and artwork through Home Assistant');
 assert(now.includes('Music Assistant')&&!now.includes('music_assistant'),'readable app name');
 const bg=card.styles.card.find(r=>typeof r.background==='string'&&r.background.includes('[[['));
 assert(Function('states','entity',bg.background.trim().slice(3,-3))(states,states['media_player.rest_living_sound_system']).includes('/api/art/1.jpg'),'artwork behind the card');
});
test('player cards: previous, play and next buttons, and a volume slider on the player that sets the volume',async()=>{
 const {tvCard}=await import('../src/tv.mjs');
 const st=(id,state,a={})=>[id,{entity_id:id,state,attributes:a}];
 const states=Object.fromEntries([st('media_player.rest_living_sound_system','on',{friendly_name:'Living Sound System',supported_features:4+8+1024,volume_level:0.42}),
  st('media_player.living_sound_system_2','playing',{friendly_name:'Living Sound System',mass_player_type:'player',supported_features:1+4+8+16+32+16384,volume_level:0.42})]);
 const entities={'media_player.rest_living_sound_system':{platform:'dsppa_am8328',device_id:'z'},'media_player.living_sound_system_2':{platform:'music_assistant',device_id:'z'}};
 const hass={states,entities,devices:{z:{manufacturer:'DSPPA'}},areas:{}};
 const card=tvCard('media_player.rest_living_sound_system',hass);
 const media=JSON.stringify(card.custom_fields.media);
 assert(media.includes('media_previous_track')&&media.includes('media_next_track')&&!media.includes('volume_up'),'skip buttons, no volume buttons');
 assert(card.styles.grid[0]['grid-template-areas'].includes('"vol vol vol"'));
 globalThis.window={};
 const html=Function('states',card.custom_fields.vol.trim().slice(3,-3))(states);
 assert(html.includes('type="range"')&&html.includes('value="42"')&&html.includes('>42%<'));
 const calls=[];globalThis.document={querySelector:()=>({hass:{callService:(...a)=>calls.push(a)}})};
 window.__dwellVol.set({dataset:{entity:'media_player.rest_living_sound_system'},value:'60'});
 assert.deepEqual(calls[0],['media_player','volume_set',{entity_id:'media_player.rest_living_sound_system',volume_level:0.6}]);
 assert(card.styles.custom_fields.vol.some(r=>r['pointer-events']==='auto'));
});

test('the Media page buttons each do their own job: Music Assistant page, Home Assistant media browser, pause all',()=>{
 const cards=generate({music_app:'d5369777_music_assistant'}).views.find(v=>v.path==='media').sections[0].cards;
 const nav=name=>cards.find(c=>c.name===name)?.tap_action?.navigation_path;
 assert.equal(nav('Music Assistant'),'/dashboard-test/music-assistant');
 assert.equal(nav('Media browser'),'/media-browser/browser');
 assert(!cards.some(c=>c.tap_action?.navigation_path==='/d5369777_music_assistant'));
});
test('the Music Assistant page carries a helper that gives the app DwellDeck\'s colours',()=>{
 const view=generate({music_app:'d5369777_music_assistant'}).views.find(v=>v.path==='music-assistant');
 const stack=view.cards[0];
 assert.equal(stack.type,'vertical-stack');
 assert.equal(stack.cards[1].type,'custom:addon-iframe-card');
 const theme=stack.cards[0].custom_fields.theme;
 assert(theme.includes('--v-theme-background')&&theme.includes('--v-theme-primary')&&theme.includes('dwelldeck-theme'));
 assert(theme.includes('--sidebar:')&&theme.includes('--card:')&&theme.includes('html.dark')&&theme.includes('--v-theme-overlay'),'newer parts and the player bar too');
 assert(stack.cards[0].extra_styles.includes('height:0'));
 assert(stack.cards[1].card_mod.style.includes('iframe { opacity: 0'),'the app starts hidden, no flash of its own colours');
});

test('the Media page opens with Recently played: what each player played, from the history, one line per thing',async()=>{
 const RealDate=Date,noon=new RealDate();noon.setHours(12,0,0,0);const at=noon.getTime();
 globalThis.Date=class extends RealDate{constructor(...a){a.length?super(...a):super(at);}static now(){return at;}};
 try{
 const {designMediaHistory}=await import('../src/music.mjs');
 const tv={type:'custom:button-card',entity:'media_player.living_tv',name:'Living TV',custom_fields:{now:'x'},triggers_update:['media_player.living_tv','remote.living_tv']};
 const speaker={type:'custom:button-card',entity:'media_player.living_zone',name:'Living Sound System',custom_fields:{now:'x'},triggers_update:['media_player.living_zone','media_player.living_ma']};
 const out={views:[{path:'media',sections:[{type:'grid',cards:[tv,speaker]}]}]};
 designMediaHistory(out);
 const section=out.views[0].sections[0];
 assert.equal(section.cards[0].heading,'Recently played','at the top');
 assert.equal(out.views[0].sections.at(-1).cards[1],speaker,'the players follow');
 const body=section.cards[1].custom_fields.played.trim().slice(3,-3);
 const now=Date.now()/1000,calls=[];
 const fakeHass={callWS:async msg=>{calls.push(msg);return {
  'media_player.living_tv':[{s:'idle',a:{app_name:'Google TV Launcher'},lu:now-7200},{s:'playing',a:{app_id:'com.netflix.ninja'},lu:now-6000},{s:'off',a:{},lu:now-3000}],
  'media_player.living_zone':[{s:'playing',a:{media_title:'Blue in Green',media_artist:'Miles Davis',source:'Internet music'},lu:now-2400},{s:'off',a:{},lu:now-600}],
  'media_player.living_ma':[{s:'playing',a:{media_title:'Blue in Green',media_artist:'Miles Davis',app_id:'music_assistant'},lu:now-2390},{s:'idle',a:{},lu:now-610}]
 };}};
 globalThis.window={};globalThis.localStorage=undefined;
 const shadow={querySelector:()=>null};
 const run=()=>Function('states','hass',body).call({shadowRoot:shadow},{},fakeHass);
 assert(run().includes('Reading the history'));
 await new Promise(r=>setTimeout(r,20));
 assert.equal(calls[0].type,'history/history_during_period');
 assert.deepEqual(calls[0].entity_ids.sort(),['media_player.living_ma','media_player.living_tv','media_player.living_zone']);
 const html=run();
 assert(html.includes('>Netflix<')&&html.includes('50 min'),'a TV app with how long');
 assert(!html.includes('>Home<'),'the home screen is not something played');
 assert.equal(html.split('Blue in Green').length-1,1,'the zone and its Music Assistant copy count once');
 assert(html.includes('Miles Davis')&&html.includes('Living Sound System')&&html.includes('Music Assistant'));
 for(const label of ['Today','Yesterday','Last week','All players'])assert(html.includes(`>${label}</option>`),label);
 window.__dwellPlayedUi.player({value:'Living TV'});
 const one=run();
 assert(one.includes('Netflix')&&!one.includes('Blue in Green'),'filtered to one player');
 } finally { globalThis.Date=RealDate; }
});

test('player cards are all one size: one width in every room, one height, rows at the top',async()=>{
 const {tvCard}=await import('../src/tv.mjs');
 const {organizedEntitySections}=await import('../src/cards.mjs');
 const st=(id,a={})=>[id,{entity_id:id,state:'off',attributes:{friendly_name:a.name,supported_features:4+16384+1}}];
 const states=Object.fromEntries([st('media_player.bbq',{name:'BBQ Sound System'}),st('media_player.bar',{name:'Bar Sound System'}),st('media_player.spotify',{name:'Spotify'})]);
 const entities={'media_player.bbq':{area_id:'pool',platform:'dsppa_am8328'},'media_player.bar':{area_id:'pool',platform:'dsppa_am8328'},'media_player.spotify':{area_id:'hall',platform:'spotify'}};
 const hass={states,entities,devices:{},floors:{},areas:{pool:{area_id:'pool',name:'Pool'},hall:{area_id:'hall',name:'Hall'}}};
 const prototype={tap_action:{browser_mod:{data:{content:{cards:[{type:'grid',cards:[{type:'tile'}]}]}}}}};
 const sections=organizedEntitySections(Object.keys(states),hass,prototype,'mdi:play','media_player');
 const pool=sections.find(s=>s.cards[0].heading==='Pool'),hall=sections.find(s=>s.cards[0].heading==='Hall');
 assert.equal(pool.column_span,2);assert.equal(hall.column_span,1,'a room with one player takes one column');
 assert(pool.cards.slice(1).every(c=>c.grid_options.columns===12)&&hall.cards[1].grid_options.columns===12,'so every player card is one column wide');
 const card=tvCard('media_player.bbq',hass);
 assert(card.styles.card.some(r=>r['min-height']==='400px'),'one height');
 assert(card.styles.grid.some(r=>r['align-content']==='start'),'rows at the top, not spread over a stretched card');
 assert(card.styles.custom_fields.now.some(r=>r['min-height']==='78px'),'now playing keeps its size with or without artwork');
});

test('an Android TV added by ADB and by Android TV Remote under different names is one TV, named as you named it',async()=>{
 const {tvCard,tvGroup}=await import('../src/tv.mjs');
 const st=(id,state,a={})=>[id,{entity_id:id,state,attributes:a}];
 const states=Object.fromEntries([
  st('media_player.rest_area_living_tv','idle',{friendly_name:'Living Tv',app_name:'Google TV Launcher',source:'Google TV Launcher',device_class:'tv'}),
  st('remote.rest_area_living_tv','unknown',{friendly_name:'Living Tv'}),
  st('media_player.rest_area_living_2f_tv_pro','on',{friendly_name:'Living 2F TV Pro',app_id:'com.netflix.ninja'}),
  st('remote.rest_area_living_2f_tv_pro','on',{friendly_name:'Living 2F TV Pro',current_activity:'com.netflix.ninja',activity_list:[]}),
  st('media_player.living_sound_system','playing',{friendly_name:'Living Sound System'})]);
 const ent=(platform,device_id,hidden)=>({platform,device_id,hidden});
 const entities={'media_player.rest_area_living_tv':ent('androidtv','adb'),'remote.rest_area_living_tv':ent('androidtv','adb'),
  'media_player.rest_area_living_2f_tv_pro':ent('androidtv_remote','atvr',true),'remote.rest_area_living_2f_tv_pro':ent('androidtv_remote','atvr'),
  'media_player.living_sound_system':ent('dsppa_am8328','zone')};
 const devices={adb:{id:'adb',area_id:'rest',name:'Android TV 192.168.14.173',name_by_user:'Living Tv'},atvr:{id:'atvr',area_id:'rest',name:'Living 2F TV Pro'},zone:{id:'zone',area_id:'rest',name:'Rest'}};
 for(const [id,e] of Object.entries(entities))e.entity_id=id;
 const hass={states,entities,devices,areas:{rest:{area_id:'rest',name:'Rest Area'}},floors:{}};
 const group=tvGroup('media_player.rest_area_living_tv',hass);
 assert.deepEqual([...group].sort(),['media_player.rest_area_living_2f_tv_pro','media_player.rest_area_living_tv']);
 assert.deepEqual(tvGroup('media_player.rest_area_living_2f_tv_pro',hass),group,'the same group from either entry');
 const card=tvCard('media_player.rest_area_living_tv',hass);
 assert.equal(card.name,'Living Tv','the name you gave it');
 assert.equal(Function('states',card.label.trim().slice(3,-3))(states),'On, Netflix','the app from Android TV Remote, not the launcher from ADB');
 // A second Android TV in the room: names decide again.
 const two={...hass,states:{...states,'media_player.bedroom_adb':{entity_id:'media_player.bedroom_adb',state:'off',attributes:{friendly_name:'Other TV'}}},
  entities:{...entities,'media_player.bedroom_adb':{...ent('androidtv','adb2'),entity_id:'media_player.bedroom_adb'}},devices:{...devices,adb2:{id:'adb2',area_id:'rest',name:'Other'}}};
 assert.deepEqual(tvGroup('media_player.rest_area_living_tv',two),['media_player.rest_area_living_tv']);
});

test('a sound system card shows the artwork from its Music Assistant player while its zone leads',async()=>{
 const {tvCard}=await import('../src/tv.mjs');
 const st=(id,state,a={})=>[id,{entity_id:id,state,attributes:a}];
 const states=Object.fromEntries([
  st('media_player.rest_area_rest_living_sound_system','playing',{friendly_name:'Living Sound System',media_title:'Feel It Still',media_artist:'Portugal. The Man',source:'Internet music',supported_features:4+128+256+16384+1}),
  st('media_player.living_sound_system_2','playing',{friendly_name:'Living Sound System',mass_player_type:'player',media_title:'Feel It Still',media_artist:'Portugal. The Man',
   entity_picture:'http://192.168.14.243:8095/imageproxy/abc',app_id:'music_assistant',entity_picture_local:'/api/media_player_proxy/media_player.living_sound_system_2?token=x',supported_features:1+4+16+32+16384})]);
 const entities={'media_player.rest_area_rest_living_sound_system':{entity_id:'media_player.rest_area_rest_living_sound_system',platform:'dsppa_am8328',device_id:'z'},
  'media_player.living_sound_system_2':{entity_id:'media_player.living_sound_system_2',platform:'music_assistant',device_id:'m'}};
 const hass={states,entities,devices:{z:{id:'z',area_id:'rest'},m:{id:'m',area_id:'rest'}},areas:{rest:{area_id:'rest',name:'Rest Area'}},floors:{}};
 const card=tvCard('media_player.rest_area_rest_living_sound_system',hass);
 assert.equal(card.entity,'media_player.rest_area_rest_living_sound_system','the zone leads (power goes to the amplifier)');
 const now=runField(card,'now',states);
 assert(now.includes('/api/media_player_proxy/media_player.living_sound_system_2')&&now.includes('Feel It Still'),'artwork and title on the card');
 assert(now.includes('>Music Assistant<')&&!now.includes('Internet music'),'the app of the entry shown, not the zone\'s input');
 const bg=card.styles.card.find(r=>r.background).background.trim().slice(3,-3);
 assert(Function('states',bg)(states).includes('url("/api/media_player_proxy/media_player.living_sound_system_2'),'artwork behind the card');
});

test('the dashboard tab bar: pill tabs, the open one in the palette accent, for every palette',async()=>{
 const {dwellTabsCss,DWELL_PALETTES}=await import('../src/theme.mjs');
 for(const key of Object.keys(DWELL_PALETTES)){
  const css=dwellTabsCss(key);
  const accent=DWELL_PALETTES[key].roles?.lamp||DWELL_PALETTES[key].roles?.accent||DWELL_PALETTES[key].colors[3];
  assert(css.includes(`ha-tab-group-tab[active]::part(base){background-color:${accent}`),key);
  assert(css.includes('--indicator-color:transparent')&&css.includes('border-radius:999px')&&css.includes('prefers-reduced-motion'),key);
 }
 assert.equal(dwellTabsCss('no-such-palette'),dwellTabsCss('lamplight'),'unknown palette falls back to the default');
});

test('player cards stay small: shared code is loaded once, not copied into every card',async()=>{
 const {tvCard}=await import('../src/tv.mjs');
 const hass=tvHass();
 const card=tvCard('media_player.saloon_tv',hass);
 const text=JSON.stringify(card);
 assert(text.length<30000,`a TV card is ${text.length} characters`);
 assert(!text.includes('com.tcl.t_solo'),'the full app name list is not in the card');
 assert(card.custom_fields.panel.includes('__dwell.dwellTvPanel(')&&card.label.includes('__dwell.dwellTvState('));
 assert.equal(typeof globalThis.__dwell.dwellTvPanel,'function');
 assert.equal(Function('states',card.label.trim().slice(3,-3))(hass.states),'On, YouTube','and it still works');
});

test('page colours and no theme blur go on the dashboard root and the browser page, for every palette',async()=>{
 const {dwellPageCss,DWELL_PALETTES}=await import('../src/theme.mjs');
 for(const key of Object.keys(DWELL_PALETTES)){
  const {root,page}=dwellPageCss(key);
  const pageColour=DWELL_PALETTES[key].roles?.page||DWELL_PALETTES[key].page;
  assert(root.startsWith(':host{')&&root.includes('--ha-card-backdrop-filter:none')&&root.includes(`--primary-background-color:${pageColour}`),key);
  assert.equal(page,`html,body{background-color:${pageColour}!important}`,key);
 }
 // Delivered by the strategy into Home Assistant's dashboard root (a style on a sections view is not applied).
 const fs=await import('node:fs');
 const strategy=fs.readFileSync(new URL('../src/strategy.mjs',import.meta.url),'utf8');
 assert(strategy.includes("put(root, 'dwelldeck-root', wanted?.root)")&&strategy.includes("put(document.head, 'dwelldeck-page', wanted?.page)"));
});

test('icon and label sit together, centred, in the player buttons and tabs (button-card centres icons with automatic margins)',async()=>{
 const {tvCard}=await import('../src/tv.mjs');
 const hass=tvHass();
 const card=tvCard('media_player.saloon_tv',hass);
 const panel=runField(card,'panel',hass.states);
 assert(/\.dw-tv \.tab ha-icon,\.dw-tv \.refresh ha-icon\{margin:0\}/.test(panel),'tabs and refresh');
 const ma=Function('states',card.custom_fields.ma?.trim().slice(3,-3)||'return ""')(hass.states);
 if(ma)assert(ma.includes('flex:none;margin:0'),'Music player and Music Assistant buttons');
 const vol=Function('states',card.custom_fields.vol.trim().slice(3,-3))(hass.states);
 assert(!vol.includes('<ha-icon')||vol.includes('margin:0'),'volume row');
});

test('on a phone, buttons inside cards get their touches (button-card cancels touches on the whole card)',async()=>{
 const {tvCard}=await import('../src/tv.mjs');
 const hass=tvHass();
 const card=tvCard('media_player.saloon_tv',hass);
 for(const field of ['panel','vol'])assert(Function('states',card.custom_fields[field].trim().slice(3,-3))(hass.states).startsWith('<div class="dw-touch" style="display:contents" ontouchstart="event.stopPropagation()" ontouchend="event.stopPropagation()"'),field);
 // Every interactive area on every page is wrapped.
 const d=generate({});
 const fields=[];const walk=x=>{if(x&&typeof x==='object'){if(x.type==='custom:button-card'&&x.custom_fields)for(const v of Object.values(x.custom_fields))if(typeof v==='string')fields.push(v);Object.values(x).forEach(walk)}};walk(d);
 const interactive=fields.filter(v=>/onclick|onchange|oninput/.test(v)||/__dwell\.(dwellTvPanel|dwellVolume|dwellMaButtons)/.test(v));
 assert(interactive.length>5);
 for(const v of interactive)assert(v.includes('class="dw-touch"'),v.slice(0,90));
});

test('the Music Assistant app fills the screen height on a phone too, not a box 80% of the width',()=>{
 const view=generate({music_app:'d5369777_music_assistant'}).views.find(v=>v.path==='music-assistant');
 const style=view.cards[0].cards[1].card_mod.style;
 assert(style.includes('#root { padding-top: 0 !important; height: calc(100dvh - 92px) !important')&&style.includes('iframe { height: 100% !important'));
});

test('installed apps open through ADB when the TV has both ADB and Android TV Remote (the remote\'s Play Store links fail for other apps)',()=>{
 const hass=tvHass();
 const cards=tvCards();
 const saloon=cards['media_player.saloon_tv'];
 globalThis.window={__dwellTvApps:{}};globalThis.localStorage=undefined;
 const states={...hass.states,'media_player.saloon_tv_adb':{...hass.states['media_player.saloon_tv_adb'],attributes:{...hass.states['media_player.saloon_tv_adb'].attributes,adb_response:'com.onplus/.MainActivity\npackage:com.CV.CablevisionPlus'}}};
 const p=panel(saloon,states);
 const onplus=p.calls.find(c=>c[2]?.command?.includes('com.onplus'));
 assert(onplus&&onplus[0]==='androidtv'&&onplus[1]==='adb_command','OnPlus opens over ADB');
 assert(onplus[2].command.includes('LEANBACK_LAUNCHER 1 || monkey -p com.onplus -c android.intent.category.LAUNCHER 1'),'TV entry first, phone entry for apps without one');
 assert(!p.calls.some(c=>c[0]==='remote'&&c[1]==='turn_on'&&/onplus|Cablevision/i.test(c[2]?.activity||'')),'not as a Play Store link');
});

test('colour variables are set once (view and popup), not copied into every card',async()=>{
 const {dwellPageCss,builtinVariables}=await import('../src/theme.mjs');
 const d=generate({});
 const copies=JSON.stringify(d.views.map(v=>({...v,card_mod:undefined}))).split(':host {--').length-1;
 assert.equal(copies,0,'no card carries its own copy');
 const css=dwellPageCss('lamplight');
 assert(css.view.startsWith('hui-view{--')&&css.popup.startsWith('browser-mod-popup{--'));
 assert(css.view.includes('--primary-text-color:#e8e2d8'),'palette applied');
 const fs=await import('node:fs');
 const strategy=fs.readFileSync(new URL('../src/strategy.mjs',import.meta.url),'utf8');
 assert(strategy.includes("put(root, 'dwelldeck-view', wanted?.view)")&&strategy.includes("put(shell, 'dwelldeck-popup', wanted?.popup)"));
 assert(strategy.includes('page.view = refreshText(page.view)'),'same design pass as the cards');
});

test('All on / All off: no code in the popup (it would run when the popup opens), lights switched one at a time',async()=>{
 const d=generate({});
 // Every bulk light button is a plain signal now, with nothing a popup could evaluate.
 const buttons=[];const walk=x=>{if(x&&typeof x==='object'){if(x.tap_action?.dwelldeck_lights)buttons.push(x);Object.values(x).forEach(walk)}};walk(d);
 assert(buttons.length>=10,'the rooms\' All on / All off buttons');
 for(const b of buttons){assert(!JSON.stringify(b.tap_action).includes('[[['),'no template in the action');assert.equal(b.tap_action.action,'fire-dom-event')}
 assert(!JSON.stringify(d).includes('"perform_action":"light.turn_on","target":{"entity_id":["'),'no single command for several lights is left');
 // DwellDeck's side: one light at a time, waiting for each, and only real failures reported.
 const {dwellSwitchLights}=await import('../src/strategy.mjs');
 const log=[];let inFlight=0,most=0;
 const states={'light.a':{state:'off',attributes:{}},'light.b':{state:'off',attributes:{friendly_name:'Bar Spot'}},'light.c':{state:'off',attributes:{}}};
 const hass={states,callService:async(d,s,data)=>{inFlight++;most=Math.max(most,inFlight);log.push(data.entity_id);await null;inFlight--;if(data.entity_id==='light.b')throw new Error('did not confirm');states[data.entity_id].state='on';}};
 const waits=[];const notes=[];
 const left=await dwellSwitchLights({service:'turn_on',entity_id:['light.a','light.b','light.c']},hass,m=>notes.push(m),async ms=>{waits.push(ms)});
 assert.deepEqual(log,['light.a','light.b','light.c'],'each light its own command, the others still go after one fails');
 assert.equal(most,1,'never more than one command at a time');
 assert(waits.filter(ms=>ms===250).length===3&&waits.includes(4000),'250 ms between lights, then the check');
 assert.deepEqual(left,['light.b']);assert.deepEqual(notes,['1 light did not turn on: Bar Spot']);
});
