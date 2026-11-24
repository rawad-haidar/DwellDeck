// Card builders: room tiles, light popups, area room cards and entity sections.
import {clone, entityPattern, walk, visit, changeLists} from './util.mjs';
import {usableRegistryEntity, roomControlEntities, roomEntities, entityArea, entityLabels, cameraEntity} from './discovery.mjs';
import {ORIGINAL_TEMPLATE} from './data.mjs';
import {tvCard, withoutDuplicatePlayers, isTv} from './tv.mjs';
import {designRoomCard, roomStatusStrip} from './rooms.mjs';

export function addRoomControls(card, room, hass) {
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
export function makeLightPopup(card, ids) {
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
export function roomTile(id, prototype, hass) {
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
      cards: withoutDuplicatePlayers(entities, hass).map(id => roomTile(id, prototype, hass))});
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
  // Ordered by how a room is used: what you change most first, readings last (they also sit in the strip on top).
  const categories = [
    ['Climate', 'mdi:thermostat', ['climate']],
    ['TVs', 'mdi:television-play', ['media_player'], id => isTv(id, hass)],
    ['Sound systems', 'mdi:speaker', ['media_player'], id => !isTv(id, hass)],
    ['Scenes', 'mdi:play-box-outline', ['scene']],
    ['Curtains', 'mdi:curtains', ['cover']],
    ['Switches', 'mdi:toggle-switch-outline', ['switch']],
    ['Cameras', 'mdi:cctv', ['camera']],
    ['Safety and presence', 'mdi:shield-home-outline', ['binary_sensor']],
    ['All sensors', 'mdi:thermometer', ['sensor']]
  ];
  for (const [title, icon, domains, only = () => true] of categories) {
    const selected = controls.filter(id => domains.includes(id.split('.')[0]) && only(id));
    const grouped = groupedRoomTiles(selected, title, icon, tilePrototype, hass);
    if (title === 'Curtains' && selected.length) {
      content.push(grouped[0], ...curtainBulkControls(selected, prototype), ...grouped.slice(1));
    } else content.push(...grouped);
  }
  const groupedDomains = new Set(categories.flatMap(([, , domains]) => domains));
  content.push(...groupedRoomTiles(controls.filter(id => !groupedDomains.has(id.split('.')[0])), 'Other entities', 'mdi:cog-outline', tilePrototype, hass));
  if (!content.length) content.push({type: 'markdown', content: 'No supported controls are assigned to this area.'});
  else if (room.temperature_sensors?.length || controls.some(id => /^(sensor|binary_sensor|climate|media_player|cover)\./.test(id))) content.unshift(roomStatusStrip(controls, hass, room));
  card.tap_action.browser_mod.data.content.cards = content;
  const activityIds = [...lights, ...controls.filter(id => !cameraEntity(id, hass) && !hass.entities?.[id]?.entity_category)];
  const active = `const ids=${JSON.stringify(activityIds)}; return ids.some(id=>{const e=states[id];if(!e)return false;const a=e.attributes?.hvac_action;if(id.startsWith('climate.'))return ['heating','cooling','drying','fan'].includes(a)||(!a&&!['off','idle','unknown','unavailable'].includes(e.state));return ['on','playing','open','opening','closing'].includes(e.state);});`;
  const condition = `(()=>{${active}})()`;
  card.styles.card.push({background: `[[[ return ${condition} ? 'linear-gradient(135deg,#493b24,#202936)' : 'linear-gradient(135deg,#1b2d40,#101c2b)'; ]]]`},
    {border: `[[[ return ${condition} ? '1px solid #d5a74c' : '1px solid rgba(156,199,225,.18)'; ]]]`});
  card.label = `[[[ const lights=${JSON.stringify(lights)}; const controls=${JSON.stringify(controls)}; const on=lights.filter(id=>states[id]?.state==='on').length; const scenes=controls.filter(id=>id.startsWith('scene.')).length; const unavailable=[...lights,...controls].filter(id=>!states[id]||states[id].state==='unavailable'||(!id.startsWith('scene.')&&states[id].state==='unknown')).length; const parts=[]; if(lights.length)parts.push(on+' on / '+lights.length+' lights'); if(scenes)parts.push(scenes+' scenes'); if(controls.length)parts.push(controls.length+' controls & sensors'); if(unavailable)parts.push(unavailable+' unavailable'); return parts.join(' · ')||'No controls assigned'; ]]]`;
  if (room.discover_controls === false) card.label = lightingStatusLabel;
  designRoomCard(card, {lights, controls, hass, room});
  return {card, lights};
}

export function areaRoomSections(config, hass, prototype, prototypeIds) {
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

export function scenesOverview(config, hass, prototype, prototypeIds) {
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

export function stateCardStyle(id) {
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

export function richEntityCard(id, hass) {
  const domain = id.split('.')[0];
  if (domain === 'media_player') return tvCard(id, hass);
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
export function floorEntitySections(ids, hass, prototype, icon) {
  const floors = Object.values(hass.floors || {}).sort((a, b) =>
    (a.level ?? -1) - (b.level ?? -1) || a.name.localeCompare(b.name));
  const groups = [...floors.map(floor => ({...floor,
    areas: Object.values(hass.areas || {}).filter(area => area.floor_id === floor.floor_id)})),
    {name: 'Areas without a floor', areas: Object.values(hass.areas || {}).filter(area => !area.floor_id)}];
  const sections = [];
  for (const floor of groups) {
    const cards = [{type: 'heading', heading: floor.name, icon: floor.icon || icon}];
    for (const area of floor.areas.sort((a, b) => a.name.localeCompare(b.name))) {
      const selected = withoutDuplicatePlayers(ids.filter(id => entityArea(id, hass) === area.area_id), hass);
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

export function updateClimateStatus(card, ids, hass) {
  const names = ids.map(id => (hass.states?.[id]?.attributes?.friendly_name ||
    hass.entities?.[id]?.original_name || id.split('.')[1])
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'));
  card.triggers_update = ids;
  card.custom_fields.status = card.custom_fields.status
    .replace(/const ids=\[[^\]]*\]/, `const ids=${JSON.stringify(ids)}`)
    .replace(/const names=\[[^\]]*\]/, `const names=${JSON.stringify(names)}`)
    .replace('of 6 enabled', 'of ${ids.length} enabled');
}

export function setCardWidth(card, columns) {
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

export function organizedEntitySections(ids, hass, prototype, icon, domain) {
  const areas = Object.values(hass.areas || {}).sort((a, b) => {
    const af = hass.floors?.[a.floor_id], bf = hass.floors?.[b.floor_id];
    return (af?.level ?? -1) - (bf?.level ?? -1) ||
      (af?.name || '').localeCompare(bf?.name || '') || a.name.localeCompare(b.name);
  });
  const sections = [];
  const tile = prototype.tap_action.browser_mod.data.content.cards.find(card => card.type === 'grid')?.cards?.[0];
  for (const area of [...areas, {area_id: '', name: 'No area assigned'}]) {
    const selected = withoutDuplicatePlayers(ids.filter(id => (entityArea(id, hass) || '') === area.area_id), hass);
    if (!selected.length) continue;
    const floor = hass.floors?.[area.floor_id];
    const cards = [{type: 'heading', heading: floor ? `${floor.name} · ${area.name}` : area.name, icon: area.icon || icon}];
    if (domain === 'cover') cards.push(...curtainBulkControls(selected, prototype).map(card => setCardWidth(card, 24)));
    cards.push(...selected.map(id => setCardWidth(roomTile(id, tile, hass), selected.length > 1 ? 12 : 24)));
    sections.push({type: 'grid', column_span: 2, cards});
  }
  return sections;
}
