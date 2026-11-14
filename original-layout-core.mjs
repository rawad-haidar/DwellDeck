// Original layout generator: one entity binding updates every reference.
const clone = value => JSON.parse(JSON.stringify(value));
export const DEPENDENCIES = [
  {name:'Button Card',tag:'button-card',owner:'custom-cards',repository:'button-card',category:'plugin'},
  {name:'card-mod',tag:'card-mod',owner:'thomasloven',repository:'lovelace-card-mod',category:'plugin'},
  {name:'Mini Graph Card',tag:'mini-graph-card',owner:'kalkih',repository:'mini-graph-card',category:'plugin'},
  {name:'Browser Mod',service:'browser_mod',owner:'thomasloven',repository:'hass-browser_mod',category:'integration'}
];
export function dependencyStatus(hass, elementRegistry) {
  return DEPENDENCIES.map(item=>({...item,ready:!!(item.service ? hass?.services?.[item.service]?.popup : elementRegistry?.get(item.tag)),
    url:`https://my.home-assistant.io/redirect/hacs_repository/?owner=${item.owner}&repository=${item.repository}&category=${item.category}`}));
}
export function inferDashboardPath(config, pathname = '') {
  if (config.dashboard_path) return config.dashboard_path.replace(/\/$/,'');
  const prefix = pathname.split('/')[1];
  return prefix && !['config','profile','hacs','marketplace','lovelace'].includes(prefix) && /^[a-z0-9_-]+$/.test(prefix) ? `/${prefix}` : '/dashboard-dwelldeck';
}
function addBuiltinColors(dashboard) {
  const variables=Object.entries(BUILTIN_THEME).filter(([key,value])=>key!=='modes'&&typeof value==='string').map(([key,value])=>`--${key}:${value};`).join('');
  const css=`:host {${variables}} ha-card {color:var(--primary-text-color);background:var(--ha-card-background);border-radius:var(--ha-card-border-radius);}`;
  for(const view of dashboard.views){delete view.theme;view.card_mod={...view.card_mod,style:`:host{${variables}}`};}
  visit(dashboard,item=>{
    const nativeCards=['markdown','tile','button','entities','history-graph','thermostat','picture-entity','alarm-panel','weather-forecast','media-control'];
    if(!nativeCards.includes(item.type)&&!item.type?.startsWith('custom:'))return;
    if(!item.card_mod)item.card_mod={style:css};
    else if(typeof item.card_mod.style==='string')item.card_mod.style=css+'\n'+item.card_mod.style;
    else if(item.card_mod.style&&typeof item.card_mod.style==='object')item.card_mod.style={...item.card_mod.style,'.':css+'\n'+(item.card_mod.style['.']||'')};
    else item.card_mod.style=css;
  });
}
const entityPattern = /\b[a-z_]+\.[a-z0-9_]+\b/g;
const listPattern = /(?<![\w$])\[\s*['"][a-z_]+\.[a-z0-9_]+['"](?:\s*,\s*['"][a-z_]+\.[a-z0-9_]+['"])*\s*,?\s*\]/g;
const walk = (value, fn) => {
  if (Array.isArray(value)) return value.map(v => walk(v, fn));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,walk(v,fn)]));
  return typeof value === 'string' ? fn(value) : value;
};
const visit = (value, fn) => {
  if (value && typeof value === 'object') { fn(value); Object.values(value).forEach(v => visit(v,fn)); }
};
function changeLists(value, before, after) {
  if (Array.isArray(value)) {
    if (value.length && value.every(v => typeof v === 'string' && before.has(v))) return [...after];
    return value.map(v => changeLists(v,before,after));
  }
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,changeLists(v,before,after)]));
  if (typeof value === 'string') return value.replace(listPattern, text => {
    const ids = text.match(entityPattern) || [];
    return ids.length && ids.every(id => before.has(id)) ? JSON.stringify(after) : text;
  });
  return value;
}
export function roomEntities(room, hass, domains = ['light','switch']) {
  const devices = hass?.devices || {}, entities = hass?.entities || {};
  const areaIds = Object.values(entities).filter(e => room.area && !e.disabled_by && !e.hidden_by &&
    (e.area_id || devices[e.device_id]?.area_id) === room.area && domains.includes(e.entity_id.split('.')[0])
  ).map(e => e.entity_id);
  const excluded = new Set(room.exclude || []);
  return [...new Set([...areaIds,...(room.entities || [])])].filter(id => !excluded.has(id) && domains.includes(id.split('.')[0]));
}
function makeLightPopup(card, ids) {
  const data = card.tap_action?.browser_mod?.data;
  if (!data?.content) return;
  visit(data.content, item => {
    if (item.type === 'grid' && Array.isArray(item.cards) && item.cards.length && item.cards.every(c => c.type === 'tile' && /^(light|switch)\./.test(c.entity || ''))) {
      const existing = new Map(item.cards.map(c => [c.entity,c])); const template = item.cards[0];
      item.cards = ids.map(id => {
        if (existing.has(id)) return existing.get(id);
        const tile = walk(template,text => text.replace(entityPattern,ref => ref === template.entity ? id : ref));
        tile.entity = id; delete tile.name; return tile;
      });
    }
    if (item.type === 'markdown') item.content = item.content.replace(/\b\d+ lights\b/g, `${ids.length} lights`);
    const action = item.tap_action;
    if (action?.target?.entity_id && ['light.turn_on','light.turn_off'].includes(action.perform_action)) {
      action.target.entity_id = ids;
      if (ids.some(id => id.startsWith('switch.'))) action.perform_action = action.perform_action.replace('light.','homeassistant.');
      if (!ids.length) item.tap_action = {action:'none'};
    }
  });
}
export function generateOriginal(template, slots, roomTemplates, config, hass = {}) {
  const bindings = config.entities || {};
  const prefix = inferDashboardPath(config,typeof location==='undefined'?'':location.pathname);
  if (!/^\/[a-z0-9_-]+$/.test(prefix)) throw new Error('Dashboard URL must be a single path, for example /dashboard-dwelldeck.');
  const lookup = new Map(slots.map(slot => [slot.placeholder, bindings[slot.key] || slot.placeholder]));
  lookup.set('sun.sun','sun.sun');
  let output = walk(template, text => {
    let result = text.replaceAll('__DWELLDECK_PATH__',prefix).replaceAll('__DWELLDECK_MUSIC_APP__',config.music_app || '');
    for (const label of LABELS) result = result.split(label.token).join(config.labels?.[label.token] || label.default);
    return result.replace(entityPattern, id => lookup.get(id) || id);
  });
  output.title = config.title || 'DwellDeck';
  for (const view of output.views) if (view.theme) view.theme = config.theme || 'DwellDeck Midnight';
  const lighting = output.views.find(v => v.path === 'lighting');
  const lightPrototype = clone(lighting.sections[roomTemplates[0].section].cards[roomTemplates[0].card]);
  const allLights = [];
  for (const room of roomTemplates) {
    const options = config.rooms?.[room.key];
    let card = lighting.sections[room.section].cards[room.card];
    const oldIds = room.placeholders.map(id => lookup.get(id) || id);
    let ids = oldIds;
    if (options && (options.area || options.entities)) {
      ids = roomEntities(options,hass);
      card = changeLists(card,new Set(oldIds),ids);
      makeLightPopup(card,ids);
    }
    if (options?.name) {
      const oldName = card.name; card.name = options.name;
      if (card.tap_action?.browser_mod?.data) {
        card.tap_action.browser_mod.data.title = `${options.name} | Lighting`;
        visit(card.tap_action.browser_mod.data.content, item => {
          if (item.type === 'markdown') item.content = item.content.split(oldName).join(options.name);
        });
      }
    }
    lighting.sections[room.section].cards[room.card] = card;
    allLights.push(...ids.filter(id => !id.includes('.dwelldeck_slot_')));
  }
  if (config.extra_rooms?.length) {
    const cards = [{type:'heading',heading:'More rooms',icon:'mdi:home-plus-outline'}];
    const prototypeIds = new Set(roomTemplates[0].placeholders.map(id => lookup.get(id) || id));
    for (const room of config.extra_rooms) {
      const ids = roomEntities(room,hass);
      const card = changeLists(lightPrototype,prototypeIds,ids);
      card.name = room.name || 'New room';
      if (card.tap_action?.browser_mod?.data) {
        card.tap_action.browser_mod.data.title = `${card.name} | Lighting`;
        visit(card.tap_action.browser_mod.data.content,item=>{
          if(item.type==='markdown')item.content=item.content.split(lightPrototype.name).join(card.name);
        });
      }
      makeLightPopup(card,ids);cards.push(card);allLights.push(...ids);
    }
    lighting.sections.push({type:'grid',cards});
  }
  // Rebuild aggregate lighting summaries and targets from the room selections.
  if (Object.keys(config.rooms || {}).length || config.extra_rooms?.length) {
    const originalLightIds = new Set(roomTemplates.flatMap(r => r.placeholders.map(id => lookup.get(id) || id)));
    const aggregateIds = [...new Set(allLights)];
    const replaceAggregates = value => {
      if (Array.isArray(value)) {
        if (value.length > 30 && value.every(id => typeof id === 'string' && originalLightIds.has(id))) return aggregateIds;
        return value.map(replaceAggregates);
      }
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,replaceAggregates(v)]));
      if (typeof value === 'string') return value.replace(listPattern,text => {
        const ids = text.match(entityPattern) || [];
        return ids.length > 30 && ids.every(id => originalLightIds.has(id)) ? JSON.stringify(aggregateIds) : text;
      });
      return value;
    };
    output = replaceAggregates(output);
  }
  // Native leaf cards with no selected entity become a small setup hint.
  visit(output,item => {
    if (typeof item.entity === 'string' && item.entity.includes('.dwelldeck_slot_')) {
      const layout = item.grid_options;
      for (const key of Object.keys(item)) delete item[key];
      Object.assign(item,{type:'markdown',content:'Select an entity in DwellDeck setup.'});
      if (layout) item.grid_options = layout;
    }
    if (item.type === 'custom:addon-iframe-card' && !config.music_app) {
      for (const key of Object.keys(item)) delete item[key];
      Object.assign(item,{type:'markdown',content:'### Music Assistant\nChoose your Music Assistant app path in DwellDeck setup.'});
    }
  });
  if(!config.theme && config.builtin_colors!==false)addBuiltinColors(output);
  return output;
}

class DwellDeckOriginalEditor extends HTMLElement {
  constructor(){super();this.attachShadow({mode:'open'});}
  setConfig(config){this.config=clone(config);this.render();}
  set hass(hass){this._hass=hass;this.shadowRoot.querySelectorAll('ha-form').forEach(f=>{f.hass=hass;});this.renderDependencies();}
  change(config){this.config=config;this.dispatchEvent(new CustomEvent('config-changed',{detail:{config},bubbles:true,composed:true}));}
  form(schema,data,callback,labels={}){
    const form=document.createElement('ha-form');form.schema=schema;form.data=data;form.hass=this._hass;
    form.computeLabel=field=>labels[field.name]||field.name.replaceAll('_',' ');
    form.addEventListener('value-changed',event=>{event.stopPropagation();callback(event.detail.value);});return form;
  }
  renderDependencies(){
    const container=this.shadowRoot.querySelector('[data-dependencies]');if(!container)return;
    container.replaceChildren();
    const heading=document.createElement('h3');heading.textContent='Installation checklist';container.append(heading);
    const help=document.createElement('p');help.textContent='Install missing items using the links, then refresh this page. Browser Mod also needs its integration set up in Devices & services. No theme file or configuration.yaml change is needed.';container.append(help);
    for(const item of dependencyStatus(this._hass,customElements)){
      const row=document.createElement('p');const label=document.createElement('span');label.textContent=`${item.ready?'✓ Ready':'○ Not detected'} · ${item.name} `;
      const link=document.createElement('a');link.href=item.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=item.ready?'Open in HACS':'Install in HACS';row.append(label,link);container.append(row);
    }
    const check=document.createElement('button');check.textContent='Check again';check.onclick=()=>this.renderDependencies();container.append(check);
  }
  render(){
    if(!this.config)return;
    this.shadowRoot.replaceChildren();
    const dependencies=document.createElement('section');dependencies.dataset.dependencies='';this.shadowRoot.append(dependencies);this.renderDependencies();
    const p=document.createElement('p');p.textContent='Original Home page, tabs and popup design. Configure lighting rooms below, then bind climate, energy, security and other entities. Save to update every reference together.';this.shadowRoot.append(p);
    this.shadowRoot.append(this.form([
      {name:'title',selector:{text:{}}},{name:'dashboard_path',selector:{text:{}}},{name:'theme',selector:{text:{}}},{name:'music_app',selector:{text:{}}}
    ],{title:'DwellDeck',...this.config},data=>this.change({...this.config,...data}),{dashboard_path:'Dashboard URL path (leave empty to detect automatically)',music_app:'Music Assistant app path (optional)',theme:'Optional installed theme (leave empty for built-in colors)'}));
    const roomDetails=document.createElement('details');roomDetails.open=true;const summary=document.createElement('summary');summary.textContent='Lighting rooms';roomDetails.append(summary);
    for(const room of ROOM_TEMPLATES){
      const details=document.createElement('details');const title=document.createElement('summary');title.textContent=this.config.rooms?.[room.key]?.name||room.name;details.append(title);
      details.append(this.form([
        {name:'name',selector:{text:{}}},{name:'area',selector:{area:{}}},{name:'entities',selector:{entity:{multiple:true,filter:{domain:['light','switch']}}}},{name:'exclude',selector:{entity:{multiple:true}}}
      ],this.config.rooms?.[room.key]||{entities:room.placeholders.map(id=>{const slot=SLOTS.find(s=>s.placeholder===id);return this.config.entities?.[slot?.key];}).filter(Boolean)},value=>this.change({...this.config,rooms:{...this.config.rooms,[room.key]:value}}),{name:'Room title',area:'Discover lights and switches from area',entities:'Lights and switches',exclude:'Excluded entities'}));roomDetails.append(details);
    }
    (this.config.extra_rooms||[]).forEach((room,index)=>{
      const details=document.createElement('details');details.open=true;
      const title=document.createElement('summary');title.textContent=room.name||'New room';details.append(title);
      details.append(this.form([{name:'name',selector:{text:{}}},{name:'area',selector:{area:{}}},{name:'entities',selector:{entity:{multiple:true,filter:{domain:['light','switch']}}}},{name:'exclude',selector:{entity:{multiple:true}}}],room,value=>{
        const extra_rooms=[...this.config.extra_rooms];extra_rooms[index]=value;this.change({...this.config,extra_rooms});
      },{name:'Room title',area:'Discover lights and switches from area',entities:'Lights and switches',exclude:'Excluded entities'}));
      const remove=document.createElement('button');remove.textContent='Remove room';remove.onclick=()=>{this.change({...this.config,extra_rooms:this.config.extra_rooms.filter((_,i)=>i!==index)});this.render();};details.append(remove);roomDetails.append(details);
    });
    const add=document.createElement('button');add.textContent='+ Add room';add.onclick=()=>{this.change({...this.config,extra_rooms:[...(this.config.extra_rooms||[]),{name:'New room',entities:[]}]});this.render();};roomDetails.append(add);
    this.shadowRoot.append(roomDetails);
    const domains=[...new Set(SLOTS.map(s=>s.domain))];
    for(const domain of domains){
      const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent=`${domain.replaceAll('_',' ')} entities`;details.append(summary);
      const domainSlots=SLOTS.filter(s=>s.domain===domain);const labels=Object.fromEntries(domainSlots.map(s=>[s.key,s.label]));
      details.append(this.form(domainSlots.map(s=>({name:s.key,selector:{entity:{filter:{domain:s.domain}}}})),this.config.entities||{},value=>this.change({...this.config,entities:{...this.config.entities,...value}}),labels));this.shadowRoot.append(details);
    }
    const style=document.createElement('style');style.textContent='p{line-height:1.5;color:var(--secondary-text-color)}details{padding:12px;margin:8px 0;border:1px solid var(--divider-color);border-radius:10px}summary{cursor:pointer;font-weight:600}ha-form{display:block;margin-top:12px}';this.shadowRoot.append(style);
  }
}
class DwellDeckOriginalStrategy extends HTMLElement {
  static configRequired=true;
  static getConfigElement(){return document.createElement('dwelldeck-original-editor');}
  static getCreateSuggestions(){return {title:'DwellDeck',icon:'mdi:view-dashboard'};}
  static async generate(config,hass){return generateOriginal(ORIGINAL_TEMPLATE,SLOTS,ROOM_TEMPLATES,config,hass);}
}
if(!customElements.get('dwelldeck-original-editor'))customElements.define('dwelldeck-original-editor',DwellDeckOriginalEditor);
if(!customElements.get('ll-strategy-dashboard-dwelldeck-original'))customElements.define('ll-strategy-dashboard-dwelldeck-original',DwellDeckOriginalStrategy);
window.customStrategies=window.customStrategies||[];
if(!window.customStrategies.some(s=>s.type==='dwelldeck-original'))window.customStrategies.push({type:'dwelldeck-original',strategyType:'dashboard',name:'DwellDeck · Original design',description:'The original Home page, navigation, styled cards and room popups with visual entity setup.'});
