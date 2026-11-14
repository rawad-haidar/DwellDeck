/* DwellDeck 0.1.0 — MIT license. No external dependencies. */
export const DOMAINS = ['light', 'switch', 'cover', 'climate', 'media_player', 'fan', 'sensor', 'binary_sensor', 'camera', 'alarm_control_panel'];
const copy = x => JSON.parse(JSON.stringify(x));
export function normalize(config) {
  const result = {title: 'DwellDeck', auto_areas: true, domains: ['light', 'switch', 'cover', 'climate', 'media_player'], ...copy(config)};
  result.domains = (result.domains || []).filter(d => DOMAINS.includes(d));
  result.rooms = (result.rooms || []).map(room => ({...room, entities: [...new Set(room.entities || [])], excluded_entities: room.excluded_entities || []}));
  return result;
}
export function resolveRooms(config, registry = {areas: [], entities: [], devices: []}) {
  const deviceAreas = new Map(registry.devices.map(d => [d.id, d.area_id]));
  const areaNames = new Map(registry.areas.map(a => [a.area_id, a.name]));
  const rooms = [...config.rooms];
  if (config.auto_areas) for (const area of registry.areas) {
    if (config.area_ids?.length && !config.area_ids.includes(area.area_id)) continue;
    if (!rooms.some(room => room.area === area.area_id)) rooms.push({area: area.area_id, entities: []});
  }
  return rooms.map((room, index) => {
    const discovered = room.area ? registry.entities.filter(entity =>
      !entity.disabled_by && !entity.hidden_by &&
      (entity.area_id || deviceAreas.get(entity.device_id)) === room.area &&
      config.domains.includes(entity.entity_id.split('.')[0])
    ).map(entity => entity.entity_id) : [];
    const excluded = new Set(room.excluded_entities || []);
    return {...room, key: String(index), name: room.name || areaNames.get(room.area) || 'New room',
      entities: [...new Set([...discovered, ...(room.entities || [])])].filter(id => !excluded.has(id))};
  }).filter(room => room.entities.length || !config.auto_areas);
}
const el = (tag, text, className) => {
  const node = document.createElement(tag); if (text != null) node.textContent = text;
  if (className) node.className = className; return node;
};
const CSS = `:host{display:block;color:var(--primary-text-color,#edf5ff)}*{box-sizing:border-box}
.shell{background:linear-gradient(135deg,#15283a,#0a1523);border:1px solid #294153;border-radius:22px;padding:24px;color:#edf5ff;font-family:var(--paper-font-body1_-_font-family,system-ui)}
header{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}h1{font-size:26px;margin:0}p{color:#abc1d3;line-height:1.5}.eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:2px;color:#55dccc;margin-bottom:8px}
.tabs{display:flex;gap:8px;flex-wrap:wrap;margin:24px 0}.tabs button,.refresh{border:1px solid #375166;background:#192f43;color:#d5e5f1;padding:10px 15px;border-radius:24px;cursor:pointer}.tabs button[aria-selected=true]{background:#49dac7;color:#06211e;border-color:#49dac7}
.rooms{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:14px}.room{border:1px solid #385166;border-radius:16px;background:#172b3f;color:inherit;padding:20px;text-align:left;cursor:pointer;min-height:125px}.room:hover{border-color:#49dac7}.room strong{font-size:19px;display:block;margin:12px 0 6px}.room span{color:#a9c3d6}.room ha-icon{color:#efca7d}.summary{display:flex;gap:12px;flex-wrap:wrap;margin-top:18px}.pill{padding:10px 15px;border:1px solid #375166;border-radius:12px;color:#c8dbe9}.error{color:#ffb6ad}.empty{padding:30px;border:1px dashed #587084;border-radius:16px}button:focus-visible{outline:3px solid #49dac7;outline-offset:3px}
dialog{color:#edf5ff;background:#101f30;border:1px solid #466278;border-radius:20px;padding:22px;width:min(900px,94vw);max-height:88vh}dialog::backdrop{background:#020711b8}dialog h2{margin:0}.close{border:0;background:#243d52;border-radius:10px;color:#fff;padding:10px 14px;cursor:pointer}.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr));gap:12px;margin-top:20px}.tiles>*{min-width:0}.extras{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:12px;margin:20px 0}.extras>*{min-width:0}@media(max-width:500px){.shell{padding:16px}h1{font-size:22px}}`;

class DwellDeck extends HTMLElement {
  static getConfigElement() { return document.createElement('dwelldeck-editor'); }
  static getStubConfig() { return {type: 'custom:dwelldeck-card', title: 'DwellDeck', auto_areas: true}; }
  constructor() { super(); this.attachShadow({mode: 'open'}); this.tab = 'all'; this.registry = {areas: [], entities: [], devices: []}; this.childrenCards = []; }
  setConfig(config) { this.config = normalize(config); this.render(); }
  getCardSize() { return 12; }
  getGridOptions() { return {columns: 36, min_columns: 12, rows: 'auto'}; }
  set hass(hass) {
    this._hass = hass;
    this.childrenCards.forEach(card => { card.hass = hass; });
    if (!this.registryLoaded && !this.loading) this.loadRegistry();
    this.updateStates();
  }
  connectedCallback() { clearInterval(this.interval); this.render(); this.interval = setInterval(() => this.loadRegistry(), 60000); if (this._hass) this.loadRegistry(); }
  disconnectedCallback() { clearInterval(this.interval); this.dialog?.close(); }
  async loadRegistry() {
    if (!this._hass || this.loading) return;
    this.loading = true;
    try {
      const [areas, entities, devices] = await Promise.all(['area', 'entity', 'device'].map(kind => this._hass.callWS({type: `config/${kind}_registry/list`})));
      const next = {areas, entities, devices};
      const changed = JSON.stringify(next) !== JSON.stringify(this.registry);
      this.registry = next; this.registryLoaded = true; this.error = '';
      if (changed || !this.shadowRoot.querySelector('.shell')) this.render();
      else this.updateStates();
    } catch (error) { this.registryLoaded = true; this.error = `Room discovery unavailable: ${error.message}. You can still configure explicit entities in Edit card.`; this.render(); }
    finally { this.loading = false; }
  }
  updateStates() {
    if (!this.config || !this._hass) return;
    for (const node of this.shadowRoot.querySelectorAll('[data-room-status]')) {
      const room = this.rooms?.find(room => room.key === node.dataset.roomStatus);
      if (!room) continue;
      const ids = this.visibleEntities(room);
      const on = ids.filter(id => ['on', 'open', 'playing', 'cooling', 'heating'].includes(this._hass.states[id]?.state)).length;
      const unavailable = ids.filter(id => !this._hass.states[id] || ['unknown', 'unavailable'].includes(this._hass.states[id].state)).length;
      node.textContent = `${ids.length} entities · ${on} active${unavailable ? ` · ${unavailable} unavailable` : ''}`;
    }
    const summary = this.shadowRoot.querySelector('[data-summary]');
    if (summary) {
      const ids = [...new Set((this.rooms || []).flatMap(room => room.entities))];
      summary.textContent = `${this.rooms?.length || 0} rooms · ${ids.filter(id => id.startsWith('light.') && this._hass.states[id]?.state === 'on').length} lights on`;
    }
  }
  visibleEntities(room) { return room.entities.filter(id => this.tab === 'all' || id.startsWith(`${this.tab}.`)); }
  async addNativeCard(config, parent, generation = this.generation) {
    try {
      const helpers = await window.loadCardHelpers();
      if (generation !== this.generation || !parent.isConnected) return;
      const card = helpers.createCardElement(config); card.hass = this._hass;
      this.childrenCards.push(card); parent.append(card);
    } catch (error) { if (parent.isConnected) parent.append(el('p', `Card could not load: ${error.message}`, 'error')); }
  }
  render() {
    if (!this.config) return;
    this.dialog?.close(); this.generation = (this.generation || 0) + 1; this.childrenCards = [];
    this.shadowRoot.replaceChildren();
    this.shadowRoot.append(el('style', CSS));
    const shell = el('div', null, 'shell'); this.shadowRoot.append(shell);
    const header = el('header'), title = el('div');
    title.append(el('div', 'Your home, at a glance', 'eyebrow'), el('h1', this.config.title));
    const refresh = el('button', 'Refresh rooms', 'refresh'); refresh.onclick = () => this.loadRegistry();
    header.append(title, refresh); shell.append(header);
    const summary = el('p'); summary.dataset.summary = ''; shell.append(summary);
    if (this.error) shell.append(el('p', this.error, 'error'));
    const extras = el('div', null, 'extras'); shell.append(extras);
    if (this.config.weather_entity) this.addNativeCard({type: 'weather-forecast', entity: this.config.weather_entity, show_forecast: false}, extras);
    for (const key of ['power_entity', 'solar_entity', 'battery_entity']) if (this.config[key]) this.addNativeCard({type: 'tile', entity: this.config[key]}, extras);
    this.rooms = resolveRooms(this.config, this.registry);
    if (this.tab !== 'all' && !this.rooms.some(room => room.entities.some(id => id.startsWith(`${this.tab}.`)))) this.tab = 'all';
    const tabs = el('div', null, 'tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Entity categories');
    const options = [['all', 'All rooms'], ['light', 'Lights'], ['switch', 'Switches'], ['cover', 'Curtains'], ['climate', 'Climate'], ['media_player', 'Media'], ['camera', 'Cameras'], ['binary_sensor', 'Sensors']];
    for (const [key, label] of options) {
      if (key !== 'all' && !this.rooms.some(room => room.entities.some(id => id.startsWith(`${key}.`)))) continue;
      const button = el('button', label); button.setAttribute('role', 'tab'); button.setAttribute('aria-selected', String(this.tab === key));
      button.onclick = () => { this.tab = key; this.render(); }; tabs.append(button);
    }
    shell.append(tabs);
    const grid = el('div', null, 'rooms'); shell.append(grid);
    for (const room of this.rooms) {
      if (!this.visibleEntities(room).length) continue;
      const button = el('button', null, 'room'); const icon = el('ha-icon'); icon.setAttribute('icon', room.icon || 'mdi:home-outline');
      const status = el('span'); status.dataset.roomStatus = room.key;
      button.append(icon, el('strong', room.name), status); button.onclick = () => this.openRoom(room); grid.append(button);
    }
    if (!grid.children.length) shell.append(el('p', this.registryLoaded ? 'No rooms yet. Edit this card to choose areas or add a room and its entities.' : 'Discovering rooms… You can also add rooms manually in Edit card.', 'empty'));
    this.updateStates();
  }
  openRoom(room) {
    this.dialog?.remove();
    const dialog = el('dialog'); this.dialog = dialog;
    const header = el('header'), close = el('button', 'Close', 'close'); close.onclick = () => dialog.close();
    header.append(el('h2', room.name), close); dialog.append(header);
    dialog.append(el('p', 'Select an entity to view its controls.'));
    const grid = el('div', null, 'tiles'); dialog.append(grid); this.shadowRoot.append(dialog);
    for (const id of this.visibleEntities(room)) {
      const domain = id.split('.')[0];
      const config = domain === 'camera' ? {type: 'picture-entity', entity: id, camera_view: 'auto'} :
        domain === 'climate' ? {type: 'thermostat', entity: id} :
        domain === 'media_player' ? {type: 'media-control', entity: id} :
        {type: 'tile', entity: id, tap_action: {action: 'more-info'}, icon_tap_action: {action: ['light', 'switch', 'fan'].includes(domain) ? 'toggle' : 'more-info'}};
      this.addNativeCard(config, grid);
    }
    dialog.addEventListener('close', () => { this.childrenCards = this.childrenCards.filter(card => !dialog.contains(card)); dialog.remove(); });
    dialog.showModal();
  }
}

class DwellDeckEditor extends HTMLElement {
  constructor() { super(); this.attachShadow({mode: 'open'}); }
  setConfig(config) { this.config = normalize(config); this.render(); }
  set hass(hass) { this._hass = hass; this.shadowRoot.querySelectorAll('ha-form').forEach(form => { form.hass = hass; }); }
  emit(config, render = false) {
    this.config = config;
    this.dispatchEvent(new CustomEvent('config-changed', {detail: {config}, bubbles: true, composed: true}));
    if (render) this.render();
  }
  form(schema, data, callback) {
    const form = el('ha-form'); form.hass = this._hass; form.schema = schema; form.data = data;
    const labels = {title: 'Dashboard title', auto_areas: 'Automatically show Home Assistant rooms', area_ids: 'Included rooms (empty means all)', domains: 'Entity types to discover', weather_entity: 'Weather (optional)', power_entity: 'Home power sensor (optional)', solar_entity: 'Solar power sensor (optional)', battery_entity: 'Battery sensor (optional)', name: 'Room name (optional for areas)', area: 'Home Assistant room / area (optional)', entities: 'Extra entities / manual room entities', excluded_entities: 'Exclude these entities', icon: 'Room icon'};
    form.computeLabel = field => labels[field.name] || field.name;
    form.addEventListener('value-changed', event => { event.stopPropagation(); callback(event.detail.value); });
    return form;
  }
  render() {
    if (!this.config) return;
    this.shadowRoot.replaceChildren();
    this.shadowRoot.append(el('style', 'p{color:var(--secondary-text-color);line-height:1.5}section{padding:16px;margin:16px 0;border:1px solid var(--divider-color);border-radius:12px}button{padding:10px 16px;border-radius:8px;border:1px solid var(--divider-color);color:var(--primary-text-color);background:var(--card-background-color);cursor:pointer}h3{margin-top:0}'));
    this.shadowRoot.append(el('p', 'Start with automatic rooms, or add your own room below. Changes update the room cards and popup buttons together. Save using Home Assistant’s Save button.'));
    const schema = [
      {name: 'title', selector: {text: {}}}, {name: 'auto_areas', selector: {boolean: {}}},
      {name: 'area_ids', selector: {area: {multiple: true}}},
      {name: 'domains', selector: {select: {multiple: true, options: DOMAINS}}},
      ...['weather_entity', 'power_entity', 'solar_entity', 'battery_entity'].map(name => ({name, selector: {entity: {filter: {domain: name === 'weather_entity' ? 'weather' : 'sensor'}}}}))
    ];
    this.shadowRoot.append(this.form(schema, this.config, value => this.emit({...this.config, ...value})));
    this.config.rooms.forEach((room, index) => {
      const section = el('section'); section.append(el('h3', room.name || `Room ${index + 1}`));
      section.append(this.form([
        {name: 'name', selector: {text: {}}}, {name: 'icon', selector: {icon: {}}},
        {name: 'area', selector: {area: {}}}, {name: 'entities', selector: {entity: {multiple: true}}},
        {name: 'excluded_entities', selector: {entity: {multiple: true}}}
      ], room, value => { const rooms = [...this.config.rooms]; rooms[index] = value; this.emit({...this.config, rooms}); }));
      const remove = el('button', 'Remove room'); remove.onclick = () => this.emit({...this.config, rooms: this.config.rooms.filter((_, i) => i !== index)}, true);
      section.append(remove); this.shadowRoot.append(section);
    });
    const add = el('button', '+ Add room'); add.onclick = () => this.emit({...this.config, rooms: [...this.config.rooms, {name: 'New room', entities: []}]}, true);
    this.shadowRoot.append(add, el('p', 'Automatic rooms follow your Home Assistant area assignments. New devices appear after Refresh rooms or the next one-minute refresh. For a custom room, choose entities directly.'));
  }
}
if (!customElements.get('dwelldeck-card')) customElements.define('dwelldeck-card', DwellDeck);
if (!customElements.get('dwelldeck-editor')) customElements.define('dwelldeck-editor', DwellDeckEditor);
window.customCards = window.customCards || [];
if (!window.customCards.some(card => card.type === 'dwelldeck-card')) window.customCards.push({type: 'dwelldeck-card', name: 'DwellDeck', description: 'A room dashboard with automatic area discovery and a visual setup editor.', preview: true});
