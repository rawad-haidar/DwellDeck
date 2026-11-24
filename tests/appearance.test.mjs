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
test('room cards show a summary, status chips and a lights button; rooms open with a status strip',()=>{
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
 assert(card.custom_fields.chips.includes('height:28px;overflow:hidden'));
 const strip=card.tap_action.browser_mod.data.content.cards[0];
 const stripText=Function('states',strip.custom_fields.chips.trim().slice(3,-3))(states).replace(/<[^>]+>/g,' ');
 for(const text of ['26.9°C','55%','Cooling 22°','TV on','Motion'])assert(stripText.includes(text),text);
 const slot=card.custom_fields.power.card.cards;
 assert.equal(slot[0].card.tap_action.perform_action,'homeassistant.turn_off');
 assert.equal(slot[0].conditions[0].condition,'or');
 assert.equal(slot[1].card.tap_action.perform_action,'homeassistant.turn_on');
 assert(slot[1].conditions.every(c=>c.state_not==='on'));
 const target=(button,st)=>Function('states',button.tap_action.target.entity_id.trim().slice(3,-3))(st);
 assert.deepEqual(target(slot[0].card,states),['light.saloon_a']);
 const offline={...states,'light.saloon_b':{state:'unavailable',attributes:{}}};
 assert.deepEqual(target(slot[1].card,offline),['light.saloon_a']);
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
test('a TV that is on but idle shows TV on, and players named Sound system are sound systems',()=>{
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
 assert(html.includes('Music playing'),'named sound system is a speaker');
 const headings=card.tap_action.browser_mod.data.content.cards.filter(c=>c.type==='heading').map(c=>c.heading);
 assert(headings.includes('TVs')&&headings.includes('Sound systems'));
 const off={...states,'media_player.rest_area_living_tv':{state:'off',attributes:{}},'remote.rest_area_living_2f_tv_pro':{state:'off',attributes:{}},'media_player.rest_area_sound_system':{state:'idle',attributes:{}}};
 const quiet=Function('states',card.custom_fields.chips.trim().slice(3,-3))(off);
 assert(!quiet.includes('TV on')&&!quiet.includes('Music'));
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
 assert.equal(match('media_player.dani_s_bedroom_daniel_dany_sound_system'),'media_player.dany');
 assert.equal(match('media_player.kitchen_kitch_kitchen_sound_system'),'media_player.kitchen');
 assert.equal(match('media_player.mini_kitchen_m_kit_m_kitchen_sound_system'),'media_player.m_kitch');
 assert.equal(match('media_player.saloon_saloon_sound_system'),'media_player.saloon');
 assert.equal(match('media_player.gym_gym_sound_system'),'media_player.gym_sound_system','no streamer: the zone in Music Assistant');
 const {tvCard}=await import('../src/tv.mjs');
 const card=tvCard('media_player.dani_s_bedroom_daniel_dany_sound_system',hass);
 globalThis.window={};
 const html=Function('states',card.custom_fields.ma.trim().slice(3,-3))(states);
 assert(html.includes('data-entity="media_player.dany"')&&html.includes('Music player')&&html.includes('Music Assistant</button>'));
 assert(card.styles.grid[0]['grid-template-areas'].includes('"ma ma ma"'));
 assert(card.styles.custom_fields.ma.some(r=>r['pointer-events']==='auto'));
 assert.equal(typeof window.__dwellTvMa.app,'function');
});
