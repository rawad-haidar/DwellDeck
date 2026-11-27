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
  if (list('cards').length) clean.cards = list('cards');
  return clean.cards || clean.area_id.length || clean.device_id.length || clean.entity_id.length ? clean : null;
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
  for (const id of ids) { const device = /^(media_player|remote)\./.test(id) && hass.entities?.[id]?.device_id; if (device) devices.add(device); }
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

// Entities everyone may see (the sun, weather, zones) don't count as shown or controlled.
const OPEN_DOMAINS = new Set(['sun', 'weather', 'zone']);
const ENTITY_ID = /\b[a-z_]+\.[a-z0-9_]+\b/g;
const SUBSTANTIVE = card => !['heading', 'markdown', 'spacer', 'custom:spacer-card'].includes(card?.type);
const refsIn = (value, known) => [...new Set((JSON.stringify(value).match(ENTITY_ID) || []).filter(id => known.has(id) && !OPEN_DOMAINS.has(id.split('.')[0])))].sort();

// Leaves the cards whose entities were all given (inside grids and stacks too).
export function pruneCards(cards, allowed, known) {
  const out = [];
  for (const card of cards || []) {
    if (Array.isArray(card?.cards) && card.type !== 'custom:button-card') {
      const kept = pruneCards(card.cards, allowed, known);
      if (kept.some(SUBSTANTIVE)) out.push({...card, cards: kept});
      continue;
    }
    if (refsIn(card, known).every(id => allowed.has(id))) out.push(card);
  }
  return out;
}

// A shared card with only some of its things given: lists of entities lose the others (so "All on"
// switches only those) and cards inside it (a room's popup) showing the others are left out.
export function narrowCard(card, allowed, known) {
  const given = id => typeof id !== 'string' || !known.has(id) || OPEN_DOMAINS.has(id.split('.')[0]) || allowed.has(id);
  // Lists lose what wasn't given: ids, [id, …] pairs (a TV with its remote), and conditions on it
  // (so "Everything is off" means everything of theirs).
  const keepItem = item => typeof item === 'string' ? given(item)
    : Array.isArray(item) ? given(item[0])
    : item && typeof item === 'object' && typeof item.condition === 'string' && typeof item.entity === 'string' ? given(item.entity) : true;
  // Templates carry their data as JSON ({"lights": [...]}, const ids=["light.a", ...]): narrowed the same way.
  const inTemplate = text => {
    let out = '', from = 0, start;
    const next = at => Math.min(...['{"', '["', "['"].map(open => text.indexOf(open, at)).map(i => i === -1 ? Infinity : i));
    while ((start = next(from)) !== Infinity) {
      // A list in single quotes (const ac=['climate.a', ...]): only ids and names, so filter it as is.
      if (text.startsWith("['", start)) {
        const end = text.indexOf(']', start);
        const body = end === -1 ? '' : text.slice(start + 1, end);
        if (end !== -1 && /^\s*'[^'\\]*'(\s*,\s*'[^'\\]*')*\s*$/.test(body)) {
          const items = body.split(',').map(item => item.trim().slice(1, -1)).filter(given);
          out += text.slice(from, start) + '[' + items.map(item => `'${item}'`).join(',') + ']';
          from = end + 1;
        } else { out += text.slice(from, start + 2); from = start + 2; }
        continue;
      }
      // Find where this object ends, minding quoted text.
      let depth = 0, quoted = false, end = -1;
      for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (quoted) { if (ch === '\\') i++; else if (ch === '"') quoted = false; continue; }
        if (ch === '"') quoted = true;
        else if (ch === '{' || ch === '[') depth++;
        else if (ch === '}' || ch === ']') { depth--; if (!depth) { end = i; break; } }
      }
      if (end === -1) break;
      const json = text.slice(start, end + 1);
      let replaced = json;
      try { replaced = JSON.stringify(walkData(JSON.parse(json))); } catch { /* not data: leave it */ }
      out += text.slice(from, start) + replaced;
      from = end + 1;
    }
    return out + text.slice(from);
  };
  // Inside a template's data, a single id that wasn't given becomes null ("alarm": null: no alarm shown).
  const walkData = value => Array.isArray(value) ? value.filter(keepItem).map(walkData)
    : typeof value === 'string' ? (given(value) ? value : null)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, walkData(item)])) : value;
  const walk = value => {
    if (Array.isArray(value)) return value.filter(keepItem).map(walk);
    // JavaScript ([[[ ]]]) and Jinja ({% %}, {{ }}) templates both carry their lists this way.
    if (typeof value === 'string') return /\[\[\[|\{%|\{\{/.test(value) && /\{"|\["|\['/.test(value) ? inTemplate(value) : value;
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) =>
      [key, key === 'cards' && Array.isArray(item) ? pruneCards(item, allowed, known).map(walk) : walk(item)]));
  };
  return walk(card);
}

// Walks a tab's cards in order. visit(card, choice) sees every card that shows or controls something,
// with its choice ({key, label, heading, refs}); it returns the card to keep, or null. Keys are the
// card's label (heading · name), numbered when repeated, so the editor and the dashboard agree on them.
export function walkTab(view, hass, visit) {
  const known = new Set(Object.keys(hass?.states || {}));
  const friendly = id => hass?.states?.[id]?.attributes?.friendly_name;
  const seen = new Map();
  let heading = '';
  const list = cards => {
    const out = [];
    for (const card of cards || []) {
      if (card?.type === 'heading') { heading = card.heading || heading; out.push(card); continue; }
      if (Array.isArray(card?.cards) && card.type !== 'custom:button-card') {
        const kept = list(card.cards);
        if (kept.some(SUBSTANTIVE)) out.push({...card, cards: kept});
        continue;
      }
      const refs = refsIn(card, known);
      if (!refs.length) { out.push(card); continue; }
      const named = [card.name, card.title, friendly(card.entity)].find(v => typeof v === 'string' && v.trim() && !v.includes('[[[')) ||
        (refs.length === 1 ? friendly(refs[0]) || refs[0] : '');
      // A card without a name is known by where it is, not by how many things it shows: the count
      // changes whenever a light is added, and a card given to someone must stay theirs.
      const where = heading || (named ? '' : 'Summary');
      const join = name => where && !name.toLowerCase().includes(where.toLowerCase()) ? `${where} · ${name}` : name;
      const base = join(named || 'overview');
      const count = (seen.get(base) || 0) + 1;
      seen.set(base, count);
      const number = text => count > 1 ? `${text} (${count})` : text;
      const key = number(base);
      // Saved before 0.9.54: the count was part of the key.
      const before = named ? key : number(join(`${refs.length} items`));
      const kept = visit(card, {key, before, label: number(join(named || `${refs.length} items`)), heading: where, refs});
      if (kept) out.push(kept);
    }
    return out;
  };
  const next = {...view};
  if (Array.isArray(view?.sections)) next.sections = view.sections.map(section => { heading = section.title || ''; return {...section, cards: list(section.cards)}; })
    .filter(section => section.cards.some(SUBSTANTIVE));
  heading = '';
  if (Array.isArray(view?.cards)) next.cards = list(view.cards);
  if (Array.isArray(view?.badges)) next.badges = list(view.badges);
  return next;
}

// The cards on a tab, for the editor: [{key, label, heading, refs}].
export function tabChoices(view, hass) {
  const choices = [];
  if (view) walkTab(view, hass, (card, choice) => { choices.push(choice); return card; });
  return choices;
}

// A tab with only what was given: the chosen cards, each narrowed to the things given on it. Picks
// made without cards (areas, devices or entities) keep the cards whose things were all given.
export function pruneView(view, target, hass) {
  const known = new Set(Object.keys(hass.states || {}));
  const allowed = targetEntities(target, hass);
  const chosen = target?.cards ? new Set(target.cards) : null;
  const next = walkTab(view, hass, (card, {key, before, refs}) =>
    chosen ? (chosen.has(key) || chosen.has(before) ? narrowCard(card, allowed, known) : null) : (refs.every(id => allowed.has(id)) ? card : null));
  if (Array.isArray(view.sections) && !next.sections.length) next.sections = [{type: 'grid', cards: [{type: 'markdown', content: 'Nothing on this page has been shared with you yet.'}]}];
  return next;
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
  const known = new Set(Object.keys(hass.states || {}));
  // Rooms not given: when the Rooms tab is limited, every area left out of it is left out of the
  // other tabs too (its lights, AC, curtains, TV), unless cards were picked on that tab.
  const denied = new Set();
  if (rooms) {
    const areaOf = id => { const entity = hass.entities?.[id]; return entity?.area_id || hass.devices?.[entity?.device_id]?.area_id || null; };
    const mainArea = refs => {
      const counts = new Map();
      for (const area of refs.map(areaOf).filter(Boolean)) counts.set(area, (counts.get(area) || 0) + 1);
      return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    };
    const givenAreas = new Set(areaIds(rooms.area_id, hass));
    if (rooms.cards) {
      const chosen = new Set(rooms.cards);
      for (const choice of tabChoices(full.views.find(view => view.path === 'rooms'), hass)) {
        const area = (chosen.has(choice.key) || chosen.has(choice.before)) && mainArea(choice.refs);
        if (area) givenAreas.add(area);
      }
    }
    for (const entity of Object.values(hass.entities || {})) {
      const area = areaOf(entity.entity_id);
      if (area && !givenAreas.has(area)) denied.add(entity.entity_id);
    }
  }
  const open = new Set([...known].filter(id => !denied.has(id)));
  const withoutDenied = view => {
    if (!denied.size) return view;
    const next = walkTab(view, hass, (card, {refs}) => refs.every(id => denied.has(id)) ? null
      : refs.some(id => denied.has(id)) ? narrowCard(card, open, known) : card);
    if (Array.isArray(view.sections) && !next.sections.length) next.sections = [{type: 'grid', cards: [{type: 'markdown', content: 'Nothing on this page has been shared with you yet.'}]}];
    return next;
  };
  // A sub-page follows the picks of the tab that opens it (Activity from a Home limited to one room).
  const opener = view => picked.find(other => !other.subview && JSON.stringify(other).includes(`/${view.path}"`));
  // Home with nothing picked for it follows the other tabs: it shows only what was given there,
  // and its summary and room cards are narrowed to that. (Home alone shows the whole of Home.)
  const others = tabs.filter(tab => tab !== 'home');
  let given = null;
  if (tabs.includes('home') && !tabTarget(kid, 'home') && others.length) {
    given = new Set();
    for (const tab of others) {
      const target = tabTarget(kid, tab);
      const ids = target ? targetEntities(target, hass) : tabChoices(full.views.find(view => view.path === tab), hass).flatMap(choice => choice.refs).filter(id => !denied.has(id));
      for (const id of ids) given.add(id);
    }
  }
  const followOthers = view => {
    const next = walkTab(view, hass, (card, {refs}) => refs.some(id => given.has(id)) ? narrowCard(card, given, known) : null);
    if (Array.isArray(view.sections) && !next.sections.length) next.sections = [{type: 'grid', cards: [{type: 'markdown', content: 'Nothing on this page has been shared with you yet.'}]}];
    return next;
  };
  const views = picked.map(view => {
    if (given && view.path === 'home') return followOthers(view);
    const sub = view.subview && !tabs.includes(view.path);
    if (given && sub && opener(view)?.path === 'home') return pruneView(view, {entity_id: [...given]}, hass);
    const target = tabTarget(kid, sub ? opener(view)?.path : view.path);
    if (!target) return withoutDenied(view);
    // A sub-page has other cards than the tab that opens it: it keeps what shows only given things.
    return pruneView(view, sub ? {...target, cards: undefined} : target, hass);
  });
  if (!views.length) return nothing;
  // Shortcuts to pages this person doesn't have would lead nowhere: they go.
  const paths = new Set(views.map(view => view.path));
  const leadsNowhere = card => {
    const to = card?.tap_action?.action === 'navigate' && String(card.tap_action.navigation_path || '');
    const page = to && to.split('/').filter(Boolean).pop();
    return !!page && full.views.some(view => view.path === page) && !paths.has(page);
  };
  // A card that shows their things stays (tapping it does nothing); a plain shortcut goes.
  const tidy = (cards, shortcuts) => (cards || []).flatMap(card => {
    if (Array.isArray(card?.cards) && card.type !== 'custom:button-card') return [{...card, cards: tidy(card.cards, shortcuts)}];
    if (!leadsNowhere(card)) return [card];
    return shortcuts || !refsIn(card, known).length ? [] : [{...card, tap_action: {action: 'none'}}];
  });
  const isShortcuts = section => (section.cards || []).some(card => card?.type === 'heading' && /^shortcuts$/i.test(card.heading || ''));
  return {...full, views: views.map(view => ({...view,
    ...(Array.isArray(view.sections) ? {sections: view.sections.map(section => ({...section, cards: tidy(section.cards, isShortcuts(section))})).filter(section => section.cards.some(SUBSTANTIVE))} : {}),
    ...(Array.isArray(view.cards) ? {cards: tidy(view.cards, false)} : {})}))};
}
