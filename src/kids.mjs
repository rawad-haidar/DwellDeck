// Limited users: a person listed under `kids` sees only the DwellDeck tabs picked for them. When the
// Rooms tab is one of them, it (and every other page that lists rooms) shows only the rooms picked
// for them. The dashboard is built in the viewer's browser for the signed-in user, so the other
// tabs are never built for them at all.
//
//   kids:
//     - user: Ali                 # Home Assistant user name (or user id)
//       tabs: [rooms, media]      # DwellDeck tabs they can see
//       rooms: [ali_room]         # with the Rooms tab: area ids or area names they can see
//
// This limits what DwellDeck shows; the guard (guard.mjs) is what sets back changes outside their
// rooms. Entries from before tabs existed (rooms only) mean the Rooms tab with those rooms.
import {normalizeName} from './util.mjs';

// Tabs a limited user can be given (their paths in the full dashboard).
export const KID_TABS = [['home', 'Home'], ['rooms', 'Rooms'], ['lighting', 'Lights'], ['curtains', 'Curtains'],
  ['climate', 'Climate'], ['energy', 'Energy'], ['music-assistant', 'Music Assistant'], ['media', 'Media'],
  ['security', 'Security'], ['outdoor', 'Pool & garden'], ['weather', 'Weather'], ['cameras', 'All cameras']];

export function kidFor(config, user) {
  if (!user || !Array.isArray(config?.kids)) return null;
  return config.kids.find(kid => kid?.user && (kid.user === user.id || normalizeName(kid.user) === normalizeName(user.name))) || null;
}

export function kidTabs(kid) {
  const tabs = [].concat(kid?.tabs || []).filter(Boolean);
  return tabs.length ? tabs : (kid?.rooms?.length ? ['rooms'] : []);
}

export function areaIds(rooms, hass) {
  return [].concat(rooms || []).map(room => hass.areas?.[room]?.area_id ||
    Object.values(hass.areas || {}).find(area => normalizeName(area.name) === normalizeName(room))?.area_id).filter(Boolean);
}

// What a limited user may see on one tab: Home Assistant target ({area_id, device_id, entity_id}),
// or null for everything on it. Entries from before per-tab choices kept their rooms in `rooms`.
export function tabTarget(kid, tab) {
  if (!kidTabs(kid).includes(tab)) return null;
  const target = kid.access?.[tab] || (tab === 'rooms' && kid.rooms?.length ? {area_id: [].concat(kid.rooms)} : null);
  if (!target) return null;
  const list = key => [].concat(target[key] || []).filter(Boolean);
  const clean = {area_id: list('area_id'), device_id: list('device_id'), entity_id: list('entity_id')};
  return clean.area_id.length || clean.device_id.length || clean.entity_id.length ? clean : null;
}

// Every entity a target stands for: its entities, the entities of its devices, and everything in its areas.
export function targetEntities(target, hass) {
  const ids = new Set(target?.entity_id || []);
  const areas = new Set(areaIds(target?.area_id, hass));
  const devices = new Set(target?.device_id || []);
  // A picked player brings its copies: the same speaker or TV seen through another integration
  // (Music Assistant, ADB, a remote) has the same name, and entities on its device belong to it.
  const nameOf = id => normalizeName(hass.states?.[id]?.attributes?.friendly_name || '');
  const copyNames = new Set([...ids].filter(id => /^(media_player|remote)\./.test(id)).map(nameOf).filter(Boolean));
  for (const id of ids) { const device = hass.entities?.[id]?.device_id; if (device) devices.add(device); }
  for (const entity of Object.values(hass.entities || {})) {
    const area = entity.area_id || hass.devices?.[entity.device_id]?.area_id;
    if (devices.has(entity.device_id) || (area && areas.has(area))) ids.add(entity.entity_id);
    else if (/^(media_player|remote)\./.test(entity.entity_id) && copyNames.has(nameOf(entity.entity_id))) ids.add(entity.entity_id);
  }
  return ids;
}

// Entities picked one by one, or as devices, on any tab. Whole areas are handled by the guard,
// which gives only their lights, TVs, air conditioners and curtains.
export function kidPicked(kid, hass) {
  const ids = new Set(), areas = new Set();
  for (const tab of kidTabs(kid)) {
    const target = tabTarget(kid, tab);
    if (!target) continue;
    for (const id of targetEntities({entity_id: target.entity_id, device_id: target.device_id}, hass)) ids.add(id);
    for (const area of areaIds(target.area_id, hass)) areas.add(area);
  }
  return {entities: [...ids].sort(), areas: [...areas].sort()};
}

// Cards on a tab that show or control anything outside what the user was given are removed.
// Entities everyone may see (the sun, weather, zones) don't count.
const OPEN_DOMAINS = new Set(['sun', 'weather', 'zone']);
const ENTITY_ID = /\b[a-z_]+\.[a-z0-9_]+\b/g;
const SUBSTANTIVE = card => !['heading', 'markdown', 'spacer', 'custom:spacer-card'].includes(card?.type);
export function pruneCards(cards, allowed, known) {
  const out = [];
  for (const card of cards || []) {
    if (Array.isArray(card?.cards) && card.type !== 'custom:button-card') {
      const kept = pruneCards(card.cards, allowed, known);
      if (kept.some(SUBSTANTIVE)) out.push({...card, cards: kept});
      continue;
    }
    const refs = (JSON.stringify(card).match(ENTITY_ID) || []).filter(id => known.has(id) && !OPEN_DOMAINS.has(id.split('.')[0]));
    if (refs.every(id => allowed.has(id))) out.push(card);
  }
  return out;
}
export function pruneView(view, allowed, hass) {
  const known = new Set(Object.keys(hass.states || {}));
  const next = {...view};
  if (Array.isArray(view.sections)) {
    next.sections = view.sections.map(section => ({...section, cards: pruneCards(section.cards, allowed, known)}))
      .filter(section => section.cards.some(SUBSTANTIVE));
    if (!next.sections.length) next.sections = [{type: 'grid', cards: [{type: 'markdown', content: 'Nothing on this page has been shared with you yet.'}]}];
  }
  if (Array.isArray(view.cards)) next.cards = pruneCards(view.cards, allowed, known);
  if (Array.isArray(view.badges)) next.badges = pruneCards(view.badges, allowed, known);
  return next;
}

// The cards on a tab that can be shared, for the editor: one choice per card showing or controlling
// something, named after the card, its entity, or the heading above it. Cards showing the same
// things are one choice. value: the entities the card refers to, joined by commas.
export function tabChoices(view, hass) {
  const known = new Set(Object.keys(hass?.states || {}));
  const friendly = id => hass?.states?.[id]?.attributes?.friendly_name;
  const byKey = new Map();
  let heading = '';
  const walk = cards => {
    for (const card of cards || []) {
      if (card?.type === 'heading') { heading = card.heading || heading; continue; }
      if (Array.isArray(card?.cards) && card.type !== 'custom:button-card') { walk(card.cards); continue; }
      const refs = [...new Set((JSON.stringify(card).match(ENTITY_ID) || []).filter(id => known.has(id) && !OPEN_DOMAINS.has(id.split('.')[0])))].sort();
      if (!refs.length) continue;
      const name = [card.name, card.title, friendly(card.entity)].find(v => typeof v === 'string' && v.trim() && !v.includes('[[[')) ||
        (refs.length === 1 ? friendly(refs[0]) || refs[0] : `${heading || 'Card'} · ${refs.length} items`);
      const key = refs.join(',');
      const entry = byKey.get(key);
      if (entry) { if (!entry.names.includes(name)) entry.names.push(name); }
      else byKey.set(key, {value: key, names: [name]});
    }
  };
  for (const section of view?.sections || []) { heading = section.title || ''; walk(section.cards); }
  walk(view?.cards);
  return [...byKey.values()].map(entry => ({value: entry.value, label: entry.names.join(' / ')}));
}

// The full dashboard's views a limited user was given, with the hidden subviews those views open
// (a Home shortcut to Weather, say). Other tabs stay out even when a picked tab links to them.
export function pickedViews(full, tabs) {
  const wanted = new Set([].concat(tabs || []));
  const views = full.views.filter(view => wanted.has(view.path));
  const text = JSON.stringify(views);
  // Sub-pages that list every device or the security system open only with their own tab.
  const owner = {devices: null, 'popup-library': null, 'security-sensors': 'security', cameras: 'security'};
  const opens = view => !(view.path in owner) || (owner[view.path] && wanted.has(owner[view.path]));
  const subviews = full.views.filter(view => view.subview && !wanted.has(view.path) && opens(view) && text.includes(`/${view.path}"`));
  return [...views, ...subviews];
}

// buildFull(config): builds the whole dashboard for a config.
export function kidsDashboard(config, hass, kid, buildFull) {
  const tabs = kidTabs(kid);
  const nothing = {title: config.title || 'DwellDeck', views: [{title: 'Home', path: 'home', icon: 'mdi:home', type: 'sections',
    sections: [{type: 'grid', cards: [{type: 'markdown', content: 'Nothing is set up for you yet. Ask a parent to give you access.'}]}]}]};
  if (!tabs.length) return nothing;
  // Rooms chosen for the Rooms tab are the only rooms built at all, so Home and Lights list only them too.
  const rooms = tabTarget(kid, 'rooms');
  const full = buildFull(rooms?.area_id.length ? {...config, only_areas: areaIds(rooms.area_id, hass)} : config);
  const picked = pickedViews(full, tabs);
  // A sub-page follows the picks of the tab that opens it (Activity from a Home limited to one room).
  const opener = view => picked.find(other => !other.subview && JSON.stringify(other).includes(`/${view.path}"`));
  const views = picked.map(view => {
    const target = tabTarget(kid, view.subview && !tabs.includes(view.path) ? opener(view)?.path : view.path);
    return target ? pruneView(view, targetEntities(target, hass), hass) : view;
  });
  return views.length ? {...full, views} : nothing;
}
