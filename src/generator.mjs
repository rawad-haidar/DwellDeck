// Original layout generator: one entity binding updates every reference.
import {clone, entityPattern, listPattern, walk, visit, changeLists} from './util.mjs';
import {discoverConfiguration, roomEntities} from './discovery.mjs';
import {addBuiltinColors, applyDwellPalette, addLivingDesign} from './theme.mjs';
import {addRoomControls, makeLightPopup, areaRoomSections, scenesOverview} from './cards.mjs';
import {rebuildRichAreaViews} from './views.mjs';
import {LABELS} from './data.mjs';

export function inferDashboardPath(config, pathname = '') {
  if (config.dashboard_path) return config.dashboard_path.replace(/\/$/,'');
  const prefix = pathname.split('/')[1];
  return prefix && !['config','profile','hacs','marketplace','lovelace'].includes(prefix) && /^[a-z0-9_-]+$/.test(prefix) ? `/${prefix}` : '/dashboard-dwelldeck';
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
