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
const ROOM_CONTROL_DOMAINS = ['cover', 'climate', 'scene', 'sensor', 'binary_sensor', 'media_player'];
const normalizeName = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export async function discoveryContext(hass) {
  if (!hass.callWS) return hass;
  const [areas, entities, devices, floors, labels] = await Promise.all([
    hass.callWS({type: 'config/area_registry/list'}),
    hass.callWS({type: 'config/entity_registry/list'}),
    hass.callWS({type: 'config/device_registry/list'}),
    hass.callWS({type: 'config/floor_registry/list'}),
    hass.callWS({type: 'config/label_registry/list'})
  ]);
  return {
    ...hass,
    areas: Object.fromEntries(areas.map(area => [area.area_id, area])),
    entities: Object.fromEntries(entities.map(entity => [entity.entity_id, entity])),
    devices: Object.fromEntries(devices.map(device => [device.id, device])),
    floors: Object.fromEntries(floors.map(floor => [floor.floor_id, floor])),
    labels: Object.fromEntries(labels.map(label => [label.label_id, label]))
  };
}

function usableRegistryEntity(entity, hass) {
  const device = hass.devices?.[entity.device_id];
  return !entity.disabled_by && !entity.hidden_by && !device?.disabled_by &&
    !hass.states?.[entity.entity_id]?.attributes?.restored;
}

function lightingCandidate(id, hass) {
  const entry = hass.entities?.[id];
  if (cameraEntity(id, hass) || entry?.entity_category || entry?.platform === 'group') return false;
  if (id.startsWith('light.')) return true;
  if (!id.startsWith('switch.')) return false;
  const state = hass.states?.[id];
  const device = hass.devices?.[entry?.device_id];
  if (entry?.entity_category) return false;
  const settingPlatforms = new Set([
    'dahua', 'unifi', 'cudy_router', 'adguard', 'pi_hole', 'solarman',
    'ecovacs', 'hassio', 'marketplace', 'browser_mod', 'onvif', 'reolink',
    'tapo_control', 'frigate', 'alexa_media', 'sonos', 'synology_dsm'
  ]);
  if (settingPlatforms.has(entry?.platform)) return false;
  const siblings = Object.values(hass.entities || {}).filter(entity =>
    entry?.device_id && entity.device_id === entry.device_id);
  if (siblings.some(entity => /^(camera|climate|media_player|vacuum|fan|water_heater|alarm_control_panel|lock|cover)\./.test(entity.entity_id))) return false;
  const text = normalizeName(`${id} ${state?.attributes?.friendly_name || ''} ${device?.model || ''}`);
  return state?.attributes?.device_class !== 'outlet' &&
    !/\b(camera|recording|privacy|detection|reboot|restart|pump|valve|irrigation|eregation|heater|boiler|socket|outlet|siren|alarm|fan|purifier|vacuum)\b/.test(text);
}

export function discoverConfiguration(config, hass, roomTemplates = ROOM_TEMPLATES, slots = SLOTS) {
  const result = clone(config);
  const previousRooms = [...Object.values(result.rooms || {}), ...(result.extra_rooms || [])];
  result.rooms = {};
  result.extra_rooms = [];
  result.area_rooms = true;
  result.entities = {...(result.entities || {})};
  const areas = Object.values(hass.areas || {}).sort((a, b) => a.name.localeCompare(b.name));
  for (const area of areas) {
    const previous = previousRooms.find(room => room.area === area.area_id) || {};
    result.rooms[area.area_id] = {
      ...previous, name: area.name, area: area.area_id,
      discover_controls: previous.discover_controls ?? true, discover_lighting: previous.discover_lighting ?? true
    };
  }
  // Bind only exact, unambiguous names within the expected entity domain.
  for (const slot of slots) {
    if (result.entities[slot.key]) continue;
    const label = normalizeName(slot.label);
    const matches = Object.values(hass.entities || {}).filter(entity => {
      if (!usableRegistryEntity(entity, hass) || !entity.entity_id.startsWith(`${slot.domain}.`)) return false;
      const state = hass.states?.[entity.entity_id];
      return [state?.attributes?.friendly_name, entity.name, entity.original_name, entity.entity_id.split('.')[1]]
        .some(name => name && normalizeName(name) === label);
    });
    if (matches.length === 1) result.entities[slot.key] = matches[0].entity_id;
  }
  result.room_controls = true;
  return result;
}

export function roomControlEntities(room, hass) {
  const domains = ['cover', 'climate', 'scene', 'media_player', 'sensor', 'binary_sensor',
    'switch', 'lock', 'fan', 'vacuum', 'valve', 'water_heater', 'alarm_control_panel', 'input_boolean'];
  const discovered = room.discover_controls ? roomEntities(room, hass, domains).filter(id => {
    const entry = hass.entities?.[id];
    if (cameraEntity(id, hass) || entry?.entity_category) return false;
    const domain = id.split('.')[0];
    if (domain === 'sensor' || domain === 'binary_sensor') return roomSensorCandidate(id, hass);
    if (domain === 'switch') {
      return !['dahua', 'unifi', 'cudy_router', 'adguard', 'solarman', 'hassio', 'ecovacs', 'marketplace'].includes(entry?.platform) &&
        !/\b(reboot|restart|privacy|record|detection|notification|update|configuration)\b/.test(normalizeName(id));
    }
    return true;
  }) : [];
  return [...new Set([...discovered, ...(room.controls || [])])].filter(id =>
    !cameraEntity(id, hass) && !(room.exclude || []).includes(id));
}

function addRoomControls(card, room, hass) {
  const content = card.tap_action?.browser_mod?.data?.content;
  if (!Array.isArray(content?.cards)) return;
  const ids = roomControlEntities(room, hass);
  if (!ids.length) return;
  const originalGrid = content.cards.find(item => item.type === 'grid' && item.cards?.some(tile => tile.type === 'tile'));
  const originalTile = originalGrid?.cards.find(tile => tile.type === 'tile');
  const tiles = ids.map(id => {
    const domain = id.split('.')[0];
    const tile = {type: 'tile', entity: id, vertical: true,
      tap_action: {action: 'more-info'}, icon_tap_action: {action: 'more-info'},
      hold_action: {action: 'more-info'}};
    if (originalTile?.card_mod) {
      tile.card_mod = walk(clone(originalTile.card_mod), value => value.replaceAll(originalTile.entity, id));
    }
    if (domain === 'light' || domain === 'switch') tile.card_mod = {style: stateCardStyle(id)};
  if (domain === 'cover') tile.features = [{type: 'cover-open-close'}];
    if (domain === 'climate') tile.features = [{type: 'target-temperature'}];
    if (domain === 'scene') {
      tile.tap_action = {action: 'perform-action', perform_action: 'scene.turn_on', target: {entity_id: id}};
      tile.icon_tap_action = clone(tile.tap_action);
    }
    return tile;
  });
  content.cards.push({type: 'heading', heading: 'Room controls', icon: 'mdi:home-automation'},
    {type: 'grid', columns: originalGrid?.columns || 3, square: false, cards: tiles});
}

export function roomEntities(room, hass, domains = ['light']) {
  const devices = hass?.devices || {}, entities = hass?.entities || {};
  const areaIds = Object.values(entities).filter(e => room.area && usableRegistryEntity(e, hass) &&
    (e.area_id || devices[e.device_id]?.area_id) === room.area && domains.includes(e.entity_id.split('.')[0])
  ).map(e => e.entity_id);
  const excluded = new Set(room.exclude || []);
  return [...new Set([...areaIds,...(room.entities || [])])].filter(id => !excluded.has(id) && domains.includes(id.split('.')[0]) &&
    (!room.discover_lighting || domains.length !== 1 || domains[0] !== 'light' || lightingCandidate(id, hass)));
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
function entityArea(id, hass) {
  const entry = hass.entities?.[id];
  return entry?.area_id || hass.devices?.[entry?.device_id]?.area_id;
}

function entityLabels(id, hass) {
  const entry = hass.entities?.[id];
  return [...new Set([...(entry?.labels || []), ...(hass.devices?.[entry?.device_id]?.labels || [])])]
    .map(label => hass.labels?.[label]).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}

function cameraEntity(id, hass) {
  const entry = hass.entities?.[id];
  const device = hass.devices?.[entry?.device_id];
  if (entityLabels(id, hass).some(label => normalizeName(label.name) === 'camera')) return true;
  if (['dahua', 'onvif', 'reolink', 'frigate', 'ezviz', 'ring'].includes(entry?.platform)) return true;
  return !!entry?.device_id && Object.values(hass.entities || {}).some(other =>
    other.device_id === entry.device_id && other.entity_id.startsWith('camera.'));
}

function roomSensorCandidate(id, hass) {
  if (cameraEntity(id, hass)) return false;
  const state = hass.states?.[id];
  const entry = hass.entities?.[id];
  if (entry?.entity_category) return false;
  const domain = id.split('.')[0];
  const deviceClass = state?.attributes?.device_class || entry?.device_class || entry?.original_device_class;
  if (['solarman', 'ecovacs', 'ipp', 'cups'].includes(entry?.platform) && !entityLabels(id, hass).length) return false;
  if (domain === 'binary_sensor') {
    return ['motion', 'occupancy', 'presence', 'door', 'window', 'opening', 'garage_door', 'smoke', 'gas', 'moisture', 'tamper', 'safety', 'problem'].includes(deviceClass);
  }
  return ['temperature', 'humidity', 'illuminance', 'battery', 'voltage', 'carbon_dioxide', 'pm25', 'pm10', 'power', 'energy'].includes(deviceClass) ||
    /gas.*raw_status/.test(id);
}

function roomTile(id, prototype, hass) {
  const domain = id.split('.')[0];
  const rich = richEntityCard(id, hass);
  if (rich) return rich;
  const tile = {type: 'tile', entity: id, vertical: true,
    tap_action: {action: 'more-info'}, icon_tap_action: {action: 'more-info'},
    hold_action: {action: 'more-info'}};
  if (prototype?.card_mod) tile.card_mod = walk(clone(prototype.card_mod), value => value.replaceAll(prototype.entity, id));
  if (domain === 'light' || domain === 'switch') {
    tile.tap_action = {action: 'toggle'};
    tile.icon_tap_action = {action: 'toggle'};
  }
  if (domain === 'light' || domain === 'switch') tile.card_mod = {style: stateCardStyle(id)};
  if (domain === 'cover') tile.features = [{type: 'cover-open-close'}];
  if (domain === 'climate' && (hass.states?.[id]?.attributes?.supported_features & 1)) {
    tile.features = [{type: 'target-temperature'}];
  }
  if (domain === 'scene') {
    tile.hide_state = true;
    tile.name = hass.entities?.[id]?.name || hass.entities?.[id]?.original_name || hass.states?.[id]?.attributes?.friendly_name || id.split('.')[1].replaceAll('_', ' ');
    tile.icon = 'mdi:play-circle-outline';
    tile.tap_action = {action: 'perform-action', perform_action: 'scene.turn_on', target: {entity_id: id}};
    tile.icon_tap_action = clone(tile.tap_action);
  }
  return tile;
}

function groupedRoomTiles(ids, title, icon, prototype, hass) {
  const groups = new Map();
  for (const id of ids) {
    const labels = entityLabels(id, hass).map(label => label.name);
    const name = labels.length ? labels.join(' · ') : '';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(id);
  }
  const cards = [];
  for (const [label, entities] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    cards.push({type: 'heading', heading: label ? `${title} · ${label}` : title, icon});
    cards.push({type: 'grid', columns: entities.some(id => /^(cover|climate|media_player)\./.test(id)) ? 1 : 3, square: false,
      cards: entities.map(id => roomTile(id, prototype, hass))});
  }
  return cards;
}

function makeAreaRoomCard(room, prototype, prototypeIds, hass) {
  const lights = roomEntities(room, hass);
  const controls = roomControlEntities(room, hass);
  const card = changeLists(clone(prototype), prototypeIds, lights);
  const lightingStatusLabel = card.label;
  const originalCards = card.tap_action.browser_mod.data.content.cards;
  const grid = originalCards.find(item => item.type === 'grid');
  const tilePrototype = grid?.cards?.[0];
  card.name = room.name;
  card.icon = hass.areas?.[room.area]?.icon || 'mdi:home-outline';
  card.triggers_update = [...new Set([...lights, ...controls])];
  card.tap_action.browser_mod.data.title = room.name;
  makeLightPopup(card, lights);
  const content = originalCards.filter(item => item.type !== 'grid');
  // Keep the original summary and all-on/off controls, then organize by function.
  if (!lights.length) content.splice(0, content.length);
  else content.push(...groupedRoomTiles(lights, 'Lights', 'mdi:lightbulb-group-outline', tilePrototype, hass));
  const categories = [
    ['Scenes', 'mdi:play-box-outline', ['scene']],
    ['Curtains', 'mdi:curtains', ['cover']],
    ['Climate', 'mdi:thermostat', ['climate']],
    ['Media', 'mdi:play-network-outline', ['media_player']],
    ['Switches', 'mdi:toggle-switch-outline', ['switch']],
    ['Safety and presence', 'mdi:shield-home-outline', ['binary_sensor']],
    ['Sensors', 'mdi:thermometer', ['sensor']],
    ['Cameras', 'mdi:cctv', ['camera']]
  ];
  for (const [title, icon, domains] of categories) {
    const selected = controls.filter(id => domains.includes(id.split('.')[0]));
    const grouped = groupedRoomTiles(selected, title, icon, tilePrototype, hass);
    if (title === 'Curtains' && selected.length) {
      content.push(grouped[0], ...curtainBulkControls(selected, prototype), ...grouped.slice(1));
    } else content.push(...grouped);
  }
  const groupedDomains = new Set(categories.flatMap(([, , domains]) => domains));
  content.push(...groupedRoomTiles(controls.filter(id => !groupedDomains.has(id.split('.')[0])), 'Other entities', 'mdi:cog-outline', tilePrototype, hass));
  if (!content.length) content.push({type: 'markdown', content: 'No supported controls are assigned to this area.'});
  card.tap_action.browser_mod.data.content.cards = content;
  const activityIds = [...lights, ...controls.filter(id => !cameraEntity(id, hass) && !hass.entities?.[id]?.entity_category)];
  const active = `const ids=${JSON.stringify(activityIds)}; return ids.some(id=>{const e=states[id];if(!e)return false;const a=e.attributes?.hvac_action;if(id.startsWith('climate.'))return ['heating','cooling','drying','fan'].includes(a)||(!a&&!['off','idle','unknown','unavailable'].includes(e.state));return ['on','playing','open','opening','closing'].includes(e.state);});`;
  const condition = `(()=>{${active}})()`;
  card.styles.card.push({background: `[[[ return ${condition} ? 'linear-gradient(135deg,#493b24,#202936)' : 'linear-gradient(135deg,#1b2d40,#101c2b)'; ]]]`},
    {border: `[[[ return ${condition} ? '1px solid #d5a74c' : '1px solid rgba(156,199,225,.18)'; ]]]`});
  card.label = `[[[ const lights=${JSON.stringify(lights)}; const controls=${JSON.stringify(controls)}; const on=lights.filter(id=>states[id]?.state==='on').length; const scenes=controls.filter(id=>id.startsWith('scene.')).length; const unavailable=[...lights,...controls].filter(id=>!states[id]||states[id].state==='unavailable'||(!id.startsWith('scene.')&&states[id].state==='unknown')).length; const parts=[]; if(lights.length)parts.push(on+' on / '+lights.length+' lights'); if(scenes)parts.push(scenes+' scenes'); if(controls.length)parts.push(controls.length+' controls & sensors'); if(unavailable)parts.push(unavailable+' unavailable'); return parts.join(' · ')||'No controls assigned'; ]]]`;
  if (room.discover_controls === false) card.label = lightingStatusLabel;
  return {card, lights};
}

function areaRoomSections(config, hass, prototype, prototypeIds) {
  const rooms = Object.values(config.rooms || {});
  const floors = Object.values(hass.floors || {}).sort((a, b) =>
    (a.level ?? -1) - (b.level ?? -1) || a.name.localeCompare(b.name));
  const groups = new Map(floors.map(floor => [floor.floor_id, {name: floor.name, icon: floor.icon || 'mdi:home-floor-0', rooms: []}]));
  for (const room of rooms) {
    const floorId = hass.areas?.[room.area]?.floor_id || '';
    if (!groups.has(floorId)) groups.set(floorId, {name: 'Areas without a floor', icon: 'mdi:home-group', rooms: []});
    groups.get(floorId).rooms.push(room);
  }
  const sections = [], lights = [];
  for (const group of groups.values()) {
    if (!group.rooms.length) continue;
    const cards = [{type: 'heading', heading: group.name, icon: group.icon}];
    for (const room of group.rooms.sort((a, b) => a.name.localeCompare(b.name))) {
      const generated = makeAreaRoomCard(room, prototype, prototypeIds, hass);
      cards.push(generated.card);
      lights.push(...generated.lights);
    }
    sections.push({type: 'grid', cards});
  }
  return {sections, lights};
}

function scenesOverview(config, hass, prototype, prototypeIds) {
  const ids = Object.values(hass.entities || {}).filter(entry =>
    entry.entity_id.startsWith('scene.') && usableRegistryEntity(entry, hass)).map(entry => entry.entity_id);
  if (!ids.length) return null;
  const tile = prototype.tap_action.browser_mod.data.content.cards.find(item => item.type === 'grid')?.cards?.[0];
  const content = [];
  const floorOrder = Object.values(hass.floors || {}).sort((a, b) => (a.level ?? -1) - (b.level ?? -1));
  const rank = new Map(floorOrder.map((floor, index) => [floor.floor_id, index]));
  const areas = Object.values(hass.areas || {}).sort((a, b) => (rank.get(a.floor_id) ?? 999) - (rank.get(b.floor_id) ?? 999) || a.name.localeCompare(b.name));
  for (const area of [...areas, {area_id: '', name: 'Unassigned scenes'}]) {
    const scenes = ids.filter(id => (entityArea(id, hass) || '') === area.area_id);
    const floor = hass.floors?.[area.floor_id];
    content.push(...groupedRoomTiles(scenes, floor ? `${floor.name} · ${area.name}` : area.name, 'mdi:play-box-outline', tile, hass));
  }
  const card = changeLists(clone(prototype), prototypeIds, []);
  card.name = 'Scenes'; card.icon = 'mdi:play-box-outline';
  card.label = `${ids.length} scenes · grouped by Home Assistant area`;
  card.triggers_update = ids;
  card.tap_action.browser_mod.data.title = 'Scenes';
  card.tap_action.browser_mod.data.content.cards = content;
  return card;
}

function stateCardStyle(id) {
  return `{% set s = states('${id}') %}
{% set action = state_attr('${id}', 'hvac_action') %}
{% set active = s in ['on', 'playing'] or action in ['heating', 'cooling', 'drying', 'fan'] or (s in ['heat', 'cool', 'heat_cool', 'auto', 'dry', 'fan_only'] and action not in ['idle', 'off']) %}
ha-card {
 background: {% if active %}linear-gradient(135deg, #493b24, #202936){% else %}linear-gradient(135deg, #1b2d40, #101c2b){% endif %};
 border: 1px solid {% if active %}#d5a74c{% else %}rgba(156,199,225,.18){% endif %};
 border-radius: 16px;
 --primary-text-color: #edf5ff; --secondary-text-color: #c0cede;
 transition: background .6s ease, border-color .6s ease;
}`;
}

function richEntityCard(id, hass) {
  const domain = id.split('.')[0];
  if (domain === 'media_player') {
    return {
      type: 'media-control', entity: id,
      grid_options: {columns: 12, rows: 'auto'},
      card_mod: {style: stateCardStyle(id) + `
{% set picture = state_attr('${id}', 'entity_picture') %}
{% if states('${id}') == 'playing' and picture %}
ha-card {
 background: linear-gradient(135deg, rgba(10,20,32,.42), rgba(10,20,32,.87)), url({{ picture | to_json }});
 background-size: cover; background-position: center;
 border-color: rgba(213,167,76,.7);
}
{% endif %}
ha-card { min-height: 180px; overflow: hidden; }
`}
    };
  }
  if (domain === 'cover' || domain === 'climate') {
    const sourceView = ORIGINAL_TEMPLATE.views.find(view => view.path === (domain === 'cover' ? 'curtains' : 'climate'));
    let prototype;
    visit(sourceView, item => {
      if (!prototype && item.type === 'tile' && item.entity?.startsWith(`${domain}.`)) prototype = item;
    });
    const card = walk(clone(prototype), value => value.replaceAll(prototype.entity, id));
    card.name = hass.states?.[id]?.attributes?.friendly_name || hass.entities?.[id]?.name || hass.entities?.[id]?.original_name || id.split('.')[1];
    card.grid_options = {columns: 12, rows: 'auto'};
    card.vertical = false;
    card.features_position = 'bottom';
    if (domain === 'cover') {
      card.state_content = ['state', 'current_position'];
      const supported = hass.states?.[id]?.attributes?.supported_features;
      card.features = [{type: 'cover-open-close'}];
      if (supported & 4) card.features.push({type: 'cover-position'});
    } else {
      card.state_content = ['state', 'hvac_action', 'current_temperature', 'temperature', 'current_humidity'];
      card.card_mod = {style: stateCardStyle(id)};
      const attributes = hass.states?.[id]?.attributes || {};
      card.features = [];
      if (attributes.supported_features & 1) card.features.push({type: 'target-temperature', style: 'buttons'});
      if (attributes.hvac_modes?.length) card.features.push({type: 'climate-hvac-modes'});
    }
    return card;
  }
  return null;
}

function availableAreaEntities(hass, domains) {
  return Object.values(hass.entities || {}).filter(entry =>
    domains.includes(entry.entity_id.split('.')[0]) && usableRegistryEntity(entry, hass))
    .map(entry => entry.entity_id);
}

function floorEntitySections(ids, hass, prototype, icon) {
  const floors = Object.values(hass.floors || {}).sort((a, b) =>
    (a.level ?? -1) - (b.level ?? -1) || a.name.localeCompare(b.name));
  const groups = [...floors.map(floor => ({...floor,
    areas: Object.values(hass.areas || {}).filter(area => area.floor_id === floor.floor_id)})),
    {name: 'Areas without a floor', areas: Object.values(hass.areas || {}).filter(area => !area.floor_id)}];
  const sections = [];
  for (const floor of groups) {
    const cards = [{type: 'heading', heading: floor.name, icon: floor.icon || icon}];
    for (const area of floor.areas.sort((a, b) => a.name.localeCompare(b.name))) {
      const selected = ids.filter(id => entityArea(id, hass) === area.area_id);
      if (!selected.length) continue;
      cards.push({type: 'heading', heading: area.name, icon: area.icon || icon});
      for (const id of selected) {
        const card = roomTile(id, prototype, hass);
        if (id.startsWith('light.')) card.grid_options = {columns: 6, rows: 'auto'};
        cards.push(card);
      }
    }
    if (cards.length > 1) sections.push({type: 'grid', cards});
  }
  const unassigned = ids.filter(id => !entityArea(id, hass));
  if (unassigned.length) sections.push({type: 'grid', cards: [
    {type: 'heading', heading: 'No area assigned', icon},
    ...unassigned.map(id => roomTile(id, prototype, hass))
  ]});
  return sections;
}

function updateClimateStatus(card, ids, hass) {
  const names = ids.map(id => (hass.states?.[id]?.attributes?.friendly_name ||
    hass.entities?.[id]?.original_name || id.split('.')[1])
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'));
  card.triggers_update = ids;
  card.custom_fields.status = card.custom_fields.status
    .replace(/const ids=\[[^\]]*\]/, `const ids=${JSON.stringify(ids)}`)
    .replace(/const names=\[[^\]]*\]/, `const names=${JSON.stringify(names)}`)
    .replace('of 6 enabled', 'of ${ids.length} enabled');
}

function setCardWidth(card, columns) {
  card.grid_options = {...card.grid_options, columns, rows: 'auto'};
  return card;
}

function curtainBulkControls(ids, prototype) {
  const buttons = prototype.tap_action.browser_mod.data.content.cards.find(card => card.type === 'horizontal-stack')?.cards;
  if (!buttons?.length) return [];
  return [{type: 'horizontal-stack', cards: [
    ['Open all', 'mdi:curtains', 'cover.open_cover'],
    ['Close all', 'mdi:curtains-closed', 'cover.close_cover']
  ].map(([name, icon, service], index) => {
    const card = clone(buttons[index] || buttons[0]);
    card.name = name; card.icon = icon;
    card.tap_action = {action: 'perform-action', perform_action: service, target: {entity_id: ids}};
    card.hold_action = {action: 'none'};
    card.triggers_update = ids;
    return card;
  })}];
}

function organizedEntitySections(ids, hass, prototype, icon, domain) {
  const areas = Object.values(hass.areas || {}).sort((a, b) => {
    const af = hass.floors?.[a.floor_id], bf = hass.floors?.[b.floor_id];
    return (af?.level ?? -1) - (bf?.level ?? -1) ||
      (af?.name || '').localeCompare(bf?.name || '') || a.name.localeCompare(b.name);
  });
  const sections = [];
  const tile = prototype.tap_action.browser_mod.data.content.cards.find(card => card.type === 'grid')?.cards?.[0];
  for (const area of [...areas, {area_id: '', name: 'No area assigned'}]) {
    const selected = ids.filter(id => (entityArea(id, hass) || '') === area.area_id);
    if (!selected.length) continue;
    const floor = hass.floors?.[area.floor_id];
    const cards = [{type: 'heading', heading: floor ? `${floor.name} · ${area.name}` : area.name, icon: area.icon || icon}];
    if (domain === 'cover') cards.push(...curtainBulkControls(selected, prototype).map(card => setCardWidth(card, 24)));
    cards.push(...selected.map(id => setCardWidth(roomTile(id, tile, hass), selected.length > 1 ? 12 : 24)));
    sections.push({type: 'grid', column_span: 2, cards});
  }
  return sections;
}

function sceneName(id, hass) {
  return normalizeName(`${id} ${hass.entities?.[id]?.name || ''} ${hass.entities?.[id]?.original_name || ''} ${hass.states?.[id]?.attributes?.friendly_name || ''}`);
}

function organizeDashboardViews(output, config, hass, prototype) {
  const lighting = output.views.find(view => view.path === 'lighting');
  const rooms = output.views.find(view => view.path === 'rooms');
  // Place room navigation immediately before Lights, keeping Home first.
  output.views.splice(output.views.indexOf(rooms), 1);
  output.views.splice(output.views.indexOf(lighting), 0, rooms);
  const lightsOnlyConfig = {...config, rooms: Object.fromEntries(Object.entries(config.rooms).map(([key, room]) =>
    [key, {...room, discover_controls: false, controls: []}]))};
  const prototypeIds = new Set();
  visit(prototype, item => {if (item.entity?.startsWith('light.')) prototypeIds.add(item.entity);});
  const generated = areaRoomSections(lightsOnlyConfig, hass, prototype, prototypeIds);
  // Empty-light areas remain on Rooms but do not produce empty Lighting popups.
  for (const section of generated.sections) {
    section.cards = section.cards.filter(card => card.type === 'heading' ||
      Object.values(lightsOnlyConfig.rooms).some(room => room.name === card.name && roomEntities(room, hass).length));
  }
  lighting.sections = [lighting.sections[0], ...generated.sections.filter(section => section.cards.length > 1)];

  const curtains = output.views.find(view => view.path === 'curtains');
  curtains.max_columns = 4;
  curtains.sections = [{...curtains.sections[0], column_span: 4},
    ...organizedEntitySections(availableAreaEntities(hass, ['cover']), hass, prototype, 'mdi:curtains', 'cover')];

  for (const card of curtains.sections[0].cards) if (card.type !== 'heading') setCardWidth(card, 24);

  const climate = output.views.find(view => view.path === 'climate');
  climate.max_columns = 4;
  const status = climate.sections.find(section => section.cards?.some(card => card.heading === 'Climate status center'));
  const activity = climate.sections.find(section => section.cards?.some(card => card.heading === 'Climate activity center'));
  const monitor = {type: 'grid', column_span: 2, cards: [
    {type: 'heading', heading: 'Climate status and activity', icon: 'mdi:chart-timeline-variant'},
    ...[...(status?.cards || []), ...(activity?.cards || [])].filter(card => card.type !== 'heading').map(card => {
      const copy = clone(card);
      if (copy.type === 'logbook') copy.card_mod = {style: 'ha-card { max-height: 300px; overflow: auto; background: linear-gradient(135deg,#1b2d40,#101c2b); border-radius: 16px; }'};
      return setCardWidth(copy, copy.type === 'logbook' ? 24 : 12);
    })
  ]};
  const ids = availableAreaEntities(hass, ['climate']);
  const nature = ids.filter(id => /SL_NATURE/i.test(hass.devices?.[hass.entities?.[id]?.device_id]?.model || ''));
  const airConditioners = ids.filter(id => !nature.includes(id));
  const natureSection = {type: 'grid', column_span: 2, cards: [
    {type: 'heading', heading: 'Nature thermostats', icon: 'mdi:thermostat'},
    ...nature.map(id => setCardWidth(richEntityCard(id, hass), 12))
  ]};
  const inverter = climate.sections.find(section => section.cards?.some(card => /Inverter start/.test(card.heading || '')));
  const sceneIds = (inverter?.cards || []).map(card => card.entity).filter(Boolean);
  const acSections = [];
  for (const id of airConditioners) {
    const areaId = entityArea(id, hass);
    const area = hass.areas?.[areaId];
    const peers = airConditioners.filter(other => entityArea(other, hass) === areaId);
    const dressing = /dress/.test(sceneName(id, hass));
    const scenes = sceneIds.filter(scene => entityArea(scene, hass) === areaId &&
      (peers.length === 1 || /dress/.test(sceneName(scene, hass)) === dressing));
    const cards = [{type: 'heading', heading: hass.states?.[id]?.attributes?.friendly_name || area?.name || 'Air conditioner', icon: 'mdi:air-conditioner'}];
    const controls = richEntityCard(id, hass);
    cards.push(setCardWidth(controls, scenes.length ? 16 : 24));
    if (scenes.length) {
      const tile = prototype.tap_action.browser_mod.data.content.cards.find(card => card.type === 'grid')?.cards?.[0];
      cards.push({type: 'vertical-stack', grid_options: {columns: 8, rows: 'auto'}, cards: scenes.map(scene => roomTile(scene, tile, hass))});
    }
    acSections.push({type: 'grid', column_span: 2, cards});
  }
  const hydronic = climate.sections.filter(section => section.cards?.some(card => /Hydronic/.test(card.heading || '')))
    .map(section => ({...section, column_span: 2}));
  const unmatchedScenes = sceneIds.filter(scene => !airConditioners.some(id => entityArea(id, hass) === entityArea(scene, hass)));
  if (unmatchedScenes.length) acSections.push({...inverter, column_span: 2, cards: inverter.cards.filter(card => !card.entity || unmatchedScenes.includes(card.entity))});
  climate.sections = [monitor, ...(nature.length ? [natureSection] : []), ...acSections, ...hydronic];

  const media = output.views.find(view => view.path === 'media');
  media.max_columns = 4;
  media.sections = [{...media.sections[0], column_span: 4},
    ...organizedEntitySections(availableAreaEntities(hass, ['media_player']), hass, prototype, 'mdi:play-network-outline', 'media_player')];

  for (const card of media.sections[0].cards) if (card.type !== 'heading') setCardWidth(card, 16);

  const cameraStyle = {style: 'ha-card { border-radius: 16px; overflow: hidden; border: 1px solid rgba(156,199,225,.18); background: #101c2b; }'};
  const cameras = output.views.find(view => view.path === 'cameras');
  const cameraIds = availableAreaEntities(hass, ['camera']);
  cameras.max_columns = 4;
  cameras.sections = [{type: 'grid', column_span: 4, cards: [
    {type: 'heading', heading: 'Cameras', icon: 'mdi:cctv'},
    ...cameraIds.map(id => ({type: 'picture-entity', entity: id,
      show_name: true, show_state: true, camera_view: 'auto', aspect_ratio: '16:9',
      tap_action: {action: 'more-info'}, grid_options: {columns: 16, rows: 'auto'}, card_mod: clone(cameraStyle)}))
  ]}];
  const security = output.views.find(view => view.path === 'security');
  security.max_columns = 4;
  for (const section of security.sections) {
    const cameraCards = section.cards.filter(card => card.type === 'picture-entity');
    section.column_span = cameraCards.length ? 4 : 2;
    for (const card of section.cards) {
      if (card.type === 'picture-entity') {
        card.grid_options = {columns: 12, rows: 'auto'};
        card.aspect_ratio = '16:9';
        card.card_mod = clone(cameraStyle);
      }
    }
  }
}

function rebuildRichAreaViews(output, config, hass, prototype, lightIds) {
  const tile = prototype.tap_action.browser_mod.data.content.cards.find(item => item.type === 'grid')?.cards?.[0];
  const lighting = output.views.find(view => view.path === 'lighting');
  const rooms = clone(lighting);
  rooms.title = 'Rooms'; rooms.path = 'rooms'; rooms.icon = 'mdi:home-group';
  rooms.sections[0].cards = [{type: 'heading', heading: 'Rooms and scenes', icon: 'mdi:home-group'},
    ...rooms.sections[0].cards.filter(card => card.name === 'Scenes')];
  output.views.splice(output.views.indexOf(lighting) + 1, 0, rooms);
  lighting.sections = [{type: 'grid', cards: lighting.sections[0].cards.filter(card =>
    card.name !== 'Scenes' && !card.entity?.startsWith('switch.'))},
    ...floorEntitySections(lightIds, hass, tile, 'mdi:lightbulb-group-outline')];
  lighting.sections[0].cards = lighting.sections[0].cards.filter(card =>
    !card.entity || lightIds.includes(card.entity));
  lighting.sections[0].cards[0].heading = 'Lighting';

  for (const [path, domain, icon] of [
    ['curtains', 'cover', 'mdi:curtains'], ['media', 'media_player', 'mdi:play-network-outline']
  ]) {
    const view = output.views.find(item => item.path === path);
    const ids = availableAreaEntities(hass, [domain]);
    // Preserve the original global controls, then use actual rooms and rich cards.
    const overview = clone(view.sections[0]);
    if (domain === 'cover' || domain === 'media_player') {
      visit(overview, item => {
        if (item.target?.entity_id) item.target.entity_id = ids;
        if (Array.isArray(item.entities)) item.entities = ids;
        if (typeof item.content === 'string') item.content = item.content.replace(listPattern, JSON.stringify(ids));
      });
    }
    view.sections = [overview, ...floorEntitySections(ids, hass, tile, icon)];
  }

  const climate = output.views.find(view => view.path === 'climate');
  const climateIds = availableAreaEntities(hass, ['climate']);
  const originalClimate = clone(climate);
  let status;
  visit(originalClimate, item => {if (item.name === 'AC live status') status = clone(item);});
  if (status) updateClimateStatus(status, climateIds, hass);
  const climateSections = [{type: 'grid', cards: [
    {type: 'heading', heading: 'Climate status center', icon: 'mdi:thermostat'},
    ...(status ? [status] : [])
  ]}];
  const style = {style: 'ha-card { background: linear-gradient(135deg,#1b2d40,#101c2b); border: 1px solid rgba(156,199,225,.18); border-radius: 16px; }'};
  climateSections.push({type: 'grid', cards: [
    {type: 'heading', heading: 'Climate activity center', icon: 'mdi:chart-timeline-variant'},
    {type: 'history-graph', title: 'Climate status history', entities: climateIds, hours_to_show: 12, card_mod: clone(style)},
    {type: 'logbook', title: 'Climate activity', entities: climateIds, hours_to_show: 12, card_mod: clone(style)}
  ]});
  // Keep the inverter scenes and hydronic controls from the original dashboard.
  for (const section of originalClimate.sections) {
    const heading = section.cards?.find(card => card.type === 'heading')?.heading || '';
    if (!/Inverter start|Hydronic/.test(heading)) continue;
    section.cards = section.cards.filter(card => !card.entity || (!card.entity.includes('.dwelldeck_slot_') && hass.states?.[card.entity]));
    if (section.cards.length > 1) climateSections.push(section);
  }
  climate.sections = [...climateSections, ...floorEntitySections(climateIds, hass, tile, 'mdi:thermostat')];

  for (const [path, domain, icon] of [
    ['security-sensors', 'binary_sensor', 'mdi:shield-home-outline'], ['cameras', 'camera', 'mdi:cctv']
  ]) {
    const view = output.views.find(item => item.path === path);
    let ids = availableAreaEntities(hass, [domain]);
    if (domain === 'binary_sensor') ids = ids.filter(id => roomSensorCandidate(id, hass));
    view.sections = floorEntitySections(ids, hass, tile, icon);
  }
  visit(output.views.find(view => view.path === 'home'), item => {
    if (item.name === 'AC live status' && item.custom_fields?.status) updateClimateStatus(item, climateIds, hass);
  });
  organizeDashboardViews(output, config, hass, prototype);
  // Restore the original Climate controls layout, with monitoring at the end.
  const monitoringCards = [];
  visit(climate, item => {
    if (item.type === 'history-graph' || item.type === 'logbook') {
      const card = setCardWidth(clone(item), 18);
      card.grid_options.rows = 9;
      card.card_mod = {style: `ha-card {
        height: 100%; min-height: 568px; max-height: none;
        box-sizing: border-box; overflow: auto;
        background: linear-gradient(135deg,#1b2d40,#101c2b);
        border: 1px solid rgba(156,199,225,.18); border-radius: 16px;
      }`};
      monitoringCards.push(card);
    }
  });
  const restoredClimate = clone(originalClimate);
  restoredClimate.sections = restoredClimate.sections.map(section => ({
    ...section, cards: section.cards.filter(card => card.type !== 'history-graph' && card.type !== 'logbook')
  })).filter(section => section.cards.length);
  visit(restoredClimate, item => {
    if (item.name === 'AC live status' && item.custom_fields?.status) {
      updateClimateStatus(item, climateIds, hass);
      // Two three-row climate tiles plus their shared grid gap.
      item.styles.card.push({'min-height': '376px'}, {height: '100%'});
    }
    if (item.entity?.startsWith('climate.')) {
      item.card_mod = {style: `${typeof item.card_mod?.style === 'string' ? item.card_mod.style : ''}\n${stateCardStyle(item.entity)}`};
    }
  });
  restoredClimate.sections.push({type: 'grid', column_span: 3, cards: [
    {type: 'heading', heading: 'Climate history and activity', icon: 'mdi:chart-timeline-variant'},
    ...monitoringCards
  ]});
  output.views[output.views.findIndex(view => view.path === 'climate')] = restoredClimate;
}

export function generateOriginal(template, slots, roomTemplates, config, hass = {}) {
  if (config.auto_discover) config = discoverConfiguration(config, hass, roomTemplates, slots);
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
  if (config.area_rooms) {
    const prototypeIds = new Set(roomTemplates[0].placeholders.map(id => lookup.get(id) || id));
    const generated = areaRoomSections(config, hass, lightPrototype, prototypeIds);
    const sceneCard = scenesOverview(config, hass, lightPrototype, prototypeIds);
    const overview = clone(lighting.sections[0]);
    if (sceneCard) overview.cards.push(sceneCard);
    lighting.sections = [overview, ...generated.sections];
    allLights.push(...generated.lights);
  }
  for (const room of (config.area_rooms ? [] : roomTemplates)) {
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
    if (config.room_controls && options) addRoomControls(card, options, hass);
    lighting.sections[room.section].cards[room.card] = card;
    allLights.push(...ids.filter(id => !id.includes('.dwelldeck_slot_')));
  }
  if (!config.area_rooms && config.extra_rooms?.length) {
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
      makeLightPopup(card,ids);
      if (config.room_controls) addRoomControls(card, room, hass);
      cards.push(card);allLights.push(...ids);
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
  if (config.area_rooms) rebuildRichAreaViews(output, config, hass, lightPrototype, [...new Set(allLights)]);
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
  addLivingDesign(output);
  return applyDwellPalette(output, config.color_palette || 'ocean');
}



const DWELL_PALETTES = {
  ocean: {name:'Ocean blue', colors:['#1b2d40','#101c2b','#172638','#4b9aee'], page:'#080f1b'},
  emerald: {name:'Emerald', colors:['#183d38','#102823','#15342e','#4cc9a6'], page:'#081712'},
  violet: {name:'Amethyst', colors:['#332547','#1d152e','#2b203c','#b294ef'], page:'#100b1b'},
  rose: {name:'Rosewood', colors:['#432b38','#291a25','#36222f','#e49db9'], page:'#190e16'},
  slate: {name:'Graphite', colors:['#303944','#1c222b','#28313c','#a4bfd8'], page:'#10141b'}
};
function applyDwellPalette(dashboard, key) {
  const palette=DWELL_PALETTES[key] || DWELL_PALETTES.ocean;
  if(key==='ocean' || !DWELL_PALETTES[key])return dashboard;
  const originals=['#1b2d40','#101c2b','#172638','#4b9aee'];
  const replacements=new Map(originals.map((color,index)=>[color,palette.colors[index]]));
  const themed=walk(dashboard,text=>text.replace(/#1b2d40|#101c2b|#172638|#4b9aee/gi,color=>replacements.get(color.toLowerCase())));
  for(const view of themed.views){
    view.card_mod ||= {};
    view.card_mod.style=(view.card_mod.style || '')+`
:host {--primary-color:${palette.colors[3]};--accent-color:${palette.colors[3]};--lovelace-background:linear-gradient(135deg,${palette.page},${palette.colors[1]});--primary-background-color:${palette.page};--ha-card-background:${palette.colors[0]};--card-background-color:${palette.colors[0]};background:linear-gradient(135deg,${palette.page},${palette.colors[1]})!important;}`;
  }
  return themed;
}

// Motion follows actual entity activity; reduced-motion preferences remain respected.
function addLivingDesign(dashboard) {
  const motion = `
    @keyframes dwell-breathe { 0%,100% {filter: brightness(1);} 50% {filter: brightness(1.14);} }
    @keyframes dwell-arrive {from {opacity:.65; transform:translateY(6px);} to {opacity:1;transform:none;} }
    ha-card {transition:background .7s ease,border-color .7s ease,box-shadow .7s ease,transform .25s ease;
      animation:dwell-arrive .45s ease both;}
    @media (hover:hover) {ha-card:hover {transform:translateY(-2px);box-shadow:0 10px 30px rgba(0,0,0,.22);}}
    @media (prefers-reduced-motion:reduce) {ha-card,ha-state-icon {animation:none!important;transition:none!important;transform:none!important;}}
  `;
  visit(dashboard, card => {
    if (card.type === 'custom:button-card') {
      const ids = (Array.isArray(card.triggers_update) ? card.triggers_update : [card.entity]).filter(id => typeof id === 'string' && /^(light|switch|cover|climate|media_player|fan)\./.test(id));
      if (!ids.length) return;
      const active = `const ids=${JSON.stringify(ids)}; return ids.some(id=>{const e=states[id];if(!e)return false;if(id.startsWith('climate.'))return ['heating','cooling','drying','fan'].includes(e.attributes?.hvac_action);return ['on','playing','opening','closing'].includes(e.state);});`;
      card.styles ||= {};
      card.styles.card ||= [];
      card.styles.card.push({transition:'background .7s ease, border-color .7s ease, box-shadow .7s ease, transform .25s ease'},
        {'box-shadow':`[[[ return (()=>{${active}})() ? '0 0 22px rgba(255,196,90,.16), inset 0 1px 0 rgba(255,223,163,.12)' : '0 5px 18px rgba(0,0,0,.12)'; ]]]`});
      card.styles.icon ||= [];
      card.styles.icon.push({animation:`[[[ return (()=>{${active}})() ? 'dwell-breathe 3.6s ease-in-out infinite' : 'none'; ]]]`});
      card.extra_styles = (card.extra_styles || '') + motion;
    } else if (['tile','thermostat','media-control','picture-entity','markdown','history-graph','logbook'].includes(card.type)) {
      let style = motion;
      if (card.entity && /^(light|switch|cover|climate|media_player|fan)\./.test(card.entity)) {
        const id=JSON.stringify(card.entity);
        style += `{% set e = states[${id}] %}
          {% set active = e is not none and (e.state in ['on','playing','opening','closing'] or e.attributes.get('hvac_action') in ['heating','cooling','drying','fan']) %}
          ha-card {box-shadow:{% if active %}0 0 24px rgba(255,196,90,.18), inset 0 1px 0 rgba(255,223,163,.12){% else %}0 5px 18px rgba(0,0,0,.12){% endif %};}
          ha-state-icon {animation:{% if active %}dwell-breathe 3.6s ease-in-out infinite{% else %}none{% endif %};}`;
      }
      if (!card.card_mod) card.card_mod={style};
      else if(typeof card.card_mod.style==='string') card.card_mod.style += '\n'+style;
      else if(card.card_mod.style && typeof card.card_mod.style==='object') card.card_mod.style['.']=(card.card_mod.style['.']||'')+'\n'+style;
    }
  });
  const home=dashboard.views.find(view=>view.path==='home');
  let greeted=false;
  visit(home, card=>{
    if(!greeted && card.type==='markdown' && card.content?.includes('now().strftime')) {
      card.content = `{% set hour = now().hour %}\n### {% if hour < 12 %}Good morning ☀️{% elif hour < 18 %}Good afternoon 🌤️{% else %}Good evening ✨{% endif %}\n` + card.content;
      greeted=true;
    }
  });
}

class DwellDeckOriginalEditor extends HTMLElement {
  constructor(){super();this.attachShadow({mode:'open'});}
  setConfig(config){
    // HA echoes each config-changed event. Keep the live form and its focus.
    if(JSON.stringify(this.config)===JSON.stringify(config))return;
    this.config=clone(config);this.render();
  }
  set hass(hass){this._hass=hass;this.shadowRoot.querySelectorAll('ha-form').forEach(f=>{f.hass=hass;});this.renderDependencies();}
  change(config){
    if(JSON.stringify(this.config)===JSON.stringify(config))return;
    this.config=clone(config);
    this.dispatchEvent(new CustomEvent('config-changed',{detail:{config:clone(this.config)},bubbles:true,composed:true}));
  }
  form(schema,data,callback,labels={}){
    const form=document.createElement('ha-form');form.schema=schema;form.data=data;form.hass=this._hass;
    form.computeLabel=field=>labels[field.name]||field.name.replaceAll('_',' ');
    form.addEventListener('value-changed',event=>{
      event.stopPropagation();
      const value=event.detail?.value;
      if(!value||typeof value!=='object')return;
      // ha-form computes the next edit from data, so advance its local data too.
      form.data=clone(value);callback(value);
    });return form;
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
    const appearance=document.createElement('section');
    const appearanceTitle=document.createElement('h3');appearanceTitle.textContent='Theme colour';appearance.append(appearanceTitle);
    const appearanceHelp=document.createElement('p');appearanceHelp.textContent='Choose your home’s palette, then Save. Active lights keep their warm yellow status.';appearance.append(appearanceHelp);
    const swatches=document.createElement('div');swatches.setAttribute('role','group');swatches.setAttribute('aria-label','Theme colour');
    for(const [key,palette] of Object.entries(DWELL_PALETTES)){
      const button=document.createElement('button');button.type='button';
      button.textContent=palette.name;
      button.setAttribute('aria-pressed',String((this.config.color_palette || 'ocean')===key));
      button.style.background=`linear-gradient(120deg,${palette.colors[0]},${palette.colors[1]})`;
      button.style.borderColor=palette.colors[3];
      button.style.borderWidth=(this.config.color_palette || 'ocean')===key?'3px':'1px';
      button.onclick=()=>{this.change({...this.config,color_palette:key});for(const other of swatches.querySelectorAll('button')){const selected=other===button;other.setAttribute('aria-pressed',String(selected));other.style.borderWidth=selected?'3px':'1px';}};
      swatches.append(button);
    }
    appearance.append(swatches);this.shadowRoot.append(appearance);
    const dependencies=document.createElement('section');dependencies.dataset.dependencies='';this.shadowRoot.append(dependencies);this.renderDependencies();
    const p=document.createElement('p');p.textContent='Original Home page, tabs and popup design. Configure lighting rooms below, then bind climate, energy, security and other entities. Save to update every reference together.';this.shadowRoot.append(p);
    this.shadowRoot.append(this.form([
      {name:'title',selector:{text:{}}},{name:'dashboard_path',selector:{text:{}}},{name:'theme',selector:{text:{}}},{name:'music_app',selector:{text:{}}}
    ],{title:this.config.title||'DwellDeck',dashboard_path:this.config.dashboard_path,theme:this.config.theme,music_app:this.config.music_app},data=>this.change({...this.config,...data}),{dashboard_path:'Dashboard URL path (leave empty to detect automatically)',music_app:'Music Assistant app path (optional)',theme:'Optional installed theme (leave empty for built-in colors)'}));
    const discover = document.createElement('button');
    discover.textContent = 'Discover rooms and devices';
    const discoveryStatus = document.createElement('p');
    discoveryStatus.setAttribute('role', 'status');
    discover.onclick = async () => {
      discover.disabled = true;
      discoveryStatus.textContent = 'Reading Home Assistant areas and devices…';
      try {
        const context = await discoveryContext(this._hass);
        const config = discoverConfiguration(this.config, context);
        config.auto_discover = true;
        this.change(config);
        this.render();
      } catch (error) {
        discoveryStatus.textContent = `Discovery failed: ${error.message}`;
        discover.disabled = false;
      }
    };
    this.shadowRoot.append(discover, discoveryStatus);
    const discoverySummary = document.createElement('p');
    discoverySummary.textContent = `${Object.values(this.config.rooms || {}).filter(room => room.area).length + (this.config.extra_rooms || []).length} rooms configured · ${Object.keys(this.config.entities || {}).length} entity bindings. Save the dashboard configuration to apply changes.`;
    this.shadowRoot.append(discoverySummary);
    this.shadowRoot.append(this.form([
      {name: 'auto_discover', selector: {boolean: {}}},
      {name: 'room_controls', selector: {boolean: {}}}
    ], {auto_discover: !!this.config.auto_discover, room_controls: !!this.config.room_controls},
    value => this.change({...this.config, ...value}), {
      auto_discover: 'Discover newly added areas automatically',
      room_controls: 'Show room controls and sensors in room popups'
    }));
    const roomDetails=document.createElement('details');roomDetails.open=true;const summary=document.createElement('summary');summary.textContent='Home Assistant areas and controls';roomDetails.append(summary);
    const editorRooms = this.config.area_rooms
      ? Object.entries(this.config.rooms || {}).map(([key, room]) => ({key, name: room.name, placeholders: []}))
      : ROOM_TEMPLATES;
    for(const room of editorRooms){
      const details=document.createElement('details');const title=document.createElement('summary');title.textContent=this.config.rooms?.[room.key]?.name||room.name;details.append(title);
      details.append(this.form([
        {name:'name',selector:{text:{}}},{name:'area',selector:{area:{}}},{name:'entities',selector:{entity:{multiple:true,filter:{domain:['light','switch']}}}},{name:'exclude',selector:{entity:{multiple:true}}},{name:'discover_controls',selector:{boolean:{}}},{name:'controls',selector:{entity:{multiple:true,filter:{domain:ROOM_CONTROL_DOMAINS}}}},{name:'discover_lighting',selector:{boolean:{}}}
      ],this.config.rooms?.[room.key]||{entities:room.placeholders.map(id=>{const slot=SLOTS.find(s=>s.placeholder===id);return this.config.entities?.[slot?.key];}).filter(Boolean)},value=>this.change({...this.config,rooms:{...this.config.rooms,[room.key]:value}}),{name:'Room title',area:'Discover lights and switches from area',entities:'Lights and switches',exclude:'Excluded entities',discover_controls:'Discover room controls and sensors',controls:'Additional room controls and sensors',discover_lighting:'Filter automatic lighting discovery to lights and lighting switches'}));roomDetails.append(details);
    }
    (this.config.extra_rooms||[]).forEach((room,index)=>{
      const details=document.createElement('details');details.open=true;
      const title=document.createElement('summary');title.textContent=room.name||'New room';details.append(title);
      details.append(this.form([{name:'name',selector:{text:{}}},{name:'area',selector:{area:{}}},{name:'entities',selector:{entity:{multiple:true,filter:{domain:['light','switch']}}}},{name:'exclude',selector:{entity:{multiple:true}}},{name:'discover_controls',selector:{boolean:{}}},{name:'controls',selector:{entity:{multiple:true,filter:{domain:ROOM_CONTROL_DOMAINS}}}},{name:'discover_lighting',selector:{boolean:{}}}],room,value=>{
        const extra_rooms=[...this.config.extra_rooms];extra_rooms[index]=value;this.change({...this.config,extra_rooms});
      },{name:'Room title',area:'Discover lights and switches from area',entities:'Lights and switches',exclude:'Excluded entities',discover_controls:'Discover room controls and sensors',controls:'Additional room controls and sensors',discover_lighting:'Filter automatic lighting discovery to lights and lighting switches'}));
      const remove=document.createElement('button');remove.textContent='Remove room';remove.onclick=()=>{this.change({...this.config,extra_rooms:this.config.extra_rooms.filter((_,i)=>i!==index)});this.render();};details.append(remove);roomDetails.append(details);
    });
    const add=document.createElement('button');add.textContent='+ Add room';add.onclick=()=>{this.change({...this.config,extra_rooms:[...(this.config.extra_rooms||[]),{name:'New room',entities:[]}]});this.render();};roomDetails.append(add);
    this.shadowRoot.append(roomDetails);
    const domains=[...new Set(SLOTS.map(s=>s.domain))];
    for(const domain of domains){
      const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent=`${domain.replaceAll('_',' ')} entities`;details.append(summary);
      const domainSlots=SLOTS.filter(s=>s.domain===domain);const labels=Object.fromEntries(domainSlots.map(s=>[s.key,s.label]));
      details.append(this.form(domainSlots.map(s=>({name:s.key,selector:{entity:{filter:{domain:s.domain}}}})),Object.fromEntries(domainSlots.filter(s=>this.config.entities?.[s.key]!==undefined).map(s=>[s.key,this.config.entities[s.key]])),value=>this.change({...this.config,entities:{...this.config.entities,...value}}),labels));this.shadowRoot.append(details);
    }
    const style=document.createElement('style');style.textContent=':host{display:block}p{line-height:1.6;color:var(--secondary-text-color)}section,details{padding:18px;margin:12px 0;border:1px solid rgba(139,185,216,.2);border-radius:18px;background:linear-gradient(135deg,rgba(71,119,157,.12),rgba(27,45,64,.06))}summary{cursor:pointer;font-weight:600;padding:4px}ha-form{display:block;margin-top:14px}button{font:inherit;font-weight:600;color:#edf5ff;padding:12px 20px;margin:6px 8px 6px 0;border:1px solid rgba(137,194,232,.45);border-radius:13px;background:linear-gradient(120deg,#244b67,#375b82,#496d84);background-size:220% 100%;box-shadow:0 5px 16px rgba(0,0,0,.14);cursor:pointer;transition:background-position .6s ease,box-shadow .3s ease,transform .2s ease}button:hover{background-position:100% 50%;border-color:#ffd16b;box-shadow:0 0 20px rgba(255,209,107,.18);transform:translateY(-1px)}button:active{transform:scale(.98);background:linear-gradient(120deg,#8b6932,#b18a46);color:#fff4d9}button:focus-visible,summary:focus-visible{outline:2px solid #ffd16b;outline-offset:4px}button:disabled{opacity:.55;cursor:wait;transform:none}a{color:#87cef1;text-underline-offset:3px}@media(prefers-reduced-motion:reduce){button{transition:none;transform:none!important}}';this.shadowRoot.append(style);
  }
}
class DwellDeckOriginalStrategy extends HTMLElement {
  static configRequired=true;
  static getConfigElement(){return document.createElement('dwelldeck-original-editor');}
  static getCreateSuggestions(){return {title:'DwellDeck',icon:'mdi:view-dashboard'};}
  static async generate(config, hass) {
    const needsDiscovery = config.auto_discover || config.room_controls ||
      Object.values(config.rooms || {}).some(room => room.area) ||
      (config.extra_rooms || []).some(room => room.area);
    const context = needsDiscovery ? await discoveryContext(hass) : hass;
    return generateOriginal(ORIGINAL_TEMPLATE, SLOTS, ROOM_TEMPLATES, config, context);
  }
}
if(!customElements.get('dwelldeck-original-editor'))customElements.define('dwelldeck-original-editor',DwellDeckOriginalEditor);
if(!customElements.get('ll-strategy-dashboard-dwelldeck-original'))customElements.define('ll-strategy-dashboard-dwelldeck-original',DwellDeckOriginalStrategy);
window.customStrategies=window.customStrategies||[];
if(!window.customStrategies.some(s=>s.type==='dwelldeck-original'))window.customStrategies.push({type:'dwelldeck-original',strategyType:'dashboard',name:'DwellDeck · Original design',description:'The original Home page, navigation, styled cards and room popups with visual entity setup.'});
