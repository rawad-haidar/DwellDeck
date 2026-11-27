// Original layout generator: one entity binding updates every reference.
import {clone, entityPattern, listPattern, walk, visit, changeLists, installShared} from './util.mjs';
import {discoverConfiguration, roomEntities, withRegistryIndex} from './discovery.mjs';
import {addBuiltinColors, applyDwellPalette, addLivingDesign, DEFAULT_PALETTE, paletteText} from './theme.mjs';
import {applyDesignRefresh, skyFirst, refreshText} from './design.mjs';
import {addRoomControls, makeLightPopup, areaRoomSections, scenesOverview} from './cards.mjs';
import {rebuildRichAreaViews} from './views.mjs';
import {cameraDetectionSection} from './detection.mjs';
import {designHome} from './home.mjs';
import {designSecurity} from './security.mjs';
import {designEnergy} from './energy.mjs';
import {designClimate} from './climate.mjs';
import {designMusic, designMediaHistory} from './music.mjs';
import {LABELS} from './data.mjs';

export function inferDashboardPath(config, pathname = '') {
  if (config.dashboard_path) return config.dashboard_path.replace(/\/$/,'');
  const prefix = pathname.split('/')[1];
  return prefix && !['config','profile','hacs','marketplace','lovelace'].includes(prefix) && /^[a-z0-9_-]+$/.test(prefix) ? `/${prefix}` : '/dashboard-dwelldeck';
}
// "All on" / "All off": one command for every light makes a hub (LifeSmart) miss confirmations, and one late
// confirmation fails the whole tap. The button now sends a plain signal (no code: a popup's settings are
// evaluated when the popup opens, and code there would run), and DwellDeck switches the lights one at a time.
export function lightsOneByOne(dashboard) {
  const bulk = action => action?.action === 'perform-action' && ['light.turn_on', 'light.turn_off', 'homeassistant.turn_on', 'homeassistant.turn_off'].includes(action.perform_action)
    && Array.isArray(action.target?.entity_id) && action.target.entity_id.length > 1 && !action.data;
  visit(dashboard, item => {
    if (!bulk(item.tap_action)) return;
    item.tap_action = {action: 'fire-dom-event', dwelldeck_lights: {service: item.tap_action.perform_action.split('.')[1], entity_id: item.tap_action.target.entity_id}};
  });
}

export function generateOriginal(template, slots, roomTemplates, config, hass = {}) {
  return withRegistryIndex(() => buildOriginal(template, slots, roomTemplates, config, hass));
}
function buildOriginal(template, slots, roomTemplates, config, hass) {
  const __A=globalThis.__dwellProf3||={};let __t=performance.now();const __m=n=>{const t=performance.now();__A[n]=(__A[n]||0)+t-__t;__t=t;};
  if (config.auto_discover) config = discoverConfiguration(config, hass, roomTemplates, slots);
  __m('1 if (config.auto_discover) config =');
  const bindings = config.entities || {};
  __m('2 const bindings = config.entities |');
  const prefix = inferDashboardPath(config,typeof location==='undefined'?'':location.pathname);
  __m('3 const prefix = inferDashboardPath(');
  if (!/^\/[a-z0-9_-]+$/.test(prefix)) throw new Error('Dashboard URL must be a single path, for example /dashboard-dwelldeck.');
  __m('4 if (!/^\\/[a-z0-9_-]+$/.test(prefix');
  const lookup = new Map(slots.map(slot => [slot.placeholder, bindings[slot.key] || slot.placeholder]));
  __m('5 const lookup = new Map(slots.map(s');
  lookup.set('sun.sun','sun.sun');
  __m("6 lookup.set('sun.sun','sun.sun');");
  let output = walk(template, text => {
    let result = text.replaceAll('__DWELLDECK_PATH__',prefix).replaceAll('__DWELLDECK_MUSIC_APP__',config.music_app || '');
    for (const label of LABELS) result = result.split(label.token).join(config.labels?.[label.token] || label.default);
    return result.replace(entityPattern, id => lookup.get(id) || id);
  });
  __m('11 });');
  output.title = config.title || 'DwellDeck';
  __m("12 output.title = config.title || 'Dw");
  skyFirst(output);
  __m('13 skyFirst(output);');
  for (const view of output.views) if (view.theme) view.theme = config.theme || 'DwellDeck Midnight';
  __m('14 for (const view of output.views) i');
  const lighting = output.views.find(v => v.path === 'lighting');
  __m('15 const lighting = output.views.find');
  const lightPrototype = clone(lighting.sections[roomTemplates[0].section].cards[roomTemplates[0].card]);
  __m('16 const lightPrototype = clone(light');
  const allLights = [];
  __m('17 const allLights = [];');
  if (config.area_rooms) {
    const prototypeIds = new Set(roomTemplates[0].placeholders.map(id => lookup.get(id) || id));
    const generated = areaRoomSections(config, hass, lightPrototype, prototypeIds);
    const sceneCard = scenesOverview(config, hass, lightPrototype, prototypeIds);
    const overview = clone(lighting.sections[0]);
    if (sceneCard) overview.cards.push(sceneCard);
    lighting.sections = [overview, ...generated.sections];
    allLights.push(...generated.lights);
  }
  __m('26 }');
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
  __m('49 }');
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
  __m('68 }');
  // Rebuild aggregate lighting summaries and targets from the room selections.
  __m('69 // Rebuild aggregate lighting summ');
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
  __m('86 }');
  if (config.area_rooms) rebuildRichAreaViews(output, config, hass, lightPrototype, [...new Set(allLights)]);
  __m('87 if (config.area_rooms) rebuildRich');
  if (config.camera_detection !== false) output.views.find(view => view.path === 'security').sections.push(cameraDetectionSection(prefix, config, hass));
  __m('88 if (config.camera_detection !== fa');
  designHome(output, {prefix, hass});
  __m('89 designHome(output, {prefix, hass})');
  designSecurity(output, {prefix});
  __m('90 designSecurity(output, {prefix});');
  designEnergy(output, {config, hass});
  __m('91 designEnergy(output, {config, hass');
  designClimate(output, {hass});
  __m('92 designClimate(output, {hass});');
  designMusic(output, config);
  __m('93 designMusic(output, config);');
  designMediaHistory(output, {hass});
  __m('94 designMediaHistory(output, {hass})');
  // Rows in entity lists (history graphs, mini graphs, entities cards) are not cards:
  __m('95 // Rows in entity lists (history g');
  // drop unselected rows, and hint only when a card has no selected rows left.
  __m('96 // drop unselected rows, and hint ');
  const unselected = row => (typeof row === 'string' ? row : row?.entity)?.includes?.('.dwelldeck_slot_');
  __m('97 const unselected = row => (typeof ');
  visit(output,item => {
    if (!item.type || !Array.isArray(item.entities) || !item.entities.some(unselected)) return;
    item.entities = item.entities.filter(row => !unselected(row));
    if (item.entities.length) return;
    const layout = item.grid_options;
    for (const key of Object.keys(item)) delete item[key];
    Object.assign(item,{type:'markdown',content:'Select an entity in DwellDeck setup.'});
    if (layout) item.grid_options = layout;
  });
  __m('106 });');
  // Native leaf cards with no selected entity become a small setup hint.
  __m('107 // Native leaf cards with no selec');
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
  __m('119 });');
  // Tiles colour by state on their own; the old "state" value is no longer understood and leaves
  __m('120 // Tiles colour by state on their ');
  // sliders (curtain position, light brightness) without a colour, so only their handle shows.
  __m('121 // sliders (curtain position, ligh');
  visit(output, item => { if (item.type === 'tile' && item.color === 'state') delete item.color; });
  __m('122 visit(output, item => { if (item.t');
  lightsOneByOne(output);
  __m('123 lightsOneByOne(output);');
  if(!config.theme && config.builtin_colors!==false)addBuiltinColors(output);
  __m('124 if(!config.theme && config.builtin');
  addLivingDesign(output);
  __m('125 addLivingDesign(output);');
  // Shared card code gets the same rewrite as the cards: palette colours, text sizes and wording.
  __m('126 // Shared card code gets the same ');
  const palette = paletteText(config.color_palette || DEFAULT_PALETTE);
  __m('127 const palette = paletteText(config');
  installShared(text => palette(refreshText(text)));
  __m('128 installShared(text => palette(refr');
  const __ret=(applyDwellPalette(applyDesignRefresh(output, config), config.color_palette || DEFAULT_PALETTE));__m("return");return __ret;
}
