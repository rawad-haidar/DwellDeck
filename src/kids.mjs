// Kids' mode: a person listed under `kids` sees one page with their own rooms' lights, TVs and air
// conditioners, and nothing else. The dashboard is built in the viewer's browser for the signed-in
// user, so other pages (security, cameras, alarm, other rooms) are never built for them at all.
//
//   kids:
//     - user: Ali            # Home Assistant user name (or user id)
//       rooms: [ali_room]    # area ids or area names
//
// This limits what DwellDeck shows. It is not a security boundary: Home Assistant itself lets any
// signed-in user control any entity, so the kids' accounts should not be administrators.
import {normalizeName, visit, installShared} from './util.mjs';
import {roomEntities, withRegistryIndex} from './discovery.mjs';
import {roomTile} from './cards.mjs';
import {isTv, withoutDuplicatePlayers} from './tv.mjs';
import {addBuiltinColors, addLivingDesign, applyDwellPalette, DEFAULT_PALETTE, paletteText} from './theme.mjs';
import {applyDesignRefresh, refreshText} from './design.mjs';
import {lightsOneByOne, phoneFriendlyPopups} from './generator.mjs';

export function kidFor(config, user) {
  if (!user || !Array.isArray(config?.kids)) return null;
  return config.kids.find(kid => kid?.user && (kid.user === user.id || normalizeName(kid.user) === normalizeName(user.name))) || null;
}

function areaFor(room, hass) {
  if (hass.areas?.[room]) return hass.areas[room];
  return Object.values(hass.areas || {}).find(area => normalizeName(area.name) === normalizeName(room)) || null;
}

// Tabs a limited user can be given besides My room (their paths in the full dashboard).
export const KID_TABS = [['home', 'Home'], ['rooms', 'Rooms'], ['lighting', 'Lights'], ['curtains', 'Curtains'],
  ['climate', 'Climate'], ['energy', 'Energy'], ['music-assistant', 'Music Assistant'], ['media', 'Media'],
  ['security', 'Security'], ['outdoor', 'Pool & garden'], ['weather', 'Weather'], ['cameras', 'All cameras']];

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

// buildFull: builds the whole dashboard, used only when the user was given tabs from it.
export function kidsDashboard(config, hass, kid, buildFull = null) {
  const tabs = [].concat(kid.tabs || []).filter(Boolean);
  const full = tabs.length && buildFull ? buildFull() : null;
  return withRegistryIndex(() => {
    const sections = [];
    for (const roomName of [].concat(kid.rooms || [])) {
      const area = areaFor(roomName, hass);
      if (!area) continue;
      const room = {area: area.area_id, name: area.name, discover_lighting: true};
      const lights = roomEntities(room, hass);
      const tvs = withoutDuplicatePlayers(roomEntities(room, hass, ['media_player']).filter(id => isTv(id, hass)), hass);
      const climates = roomEntities(room, hass, ['climate']);
      const cards = [{type: 'heading', heading: area.name, icon: area.icon || 'mdi:bed'}];
      if (lights.length) {
        cards.push({type: 'heading', heading: 'Lights', heading_style: 'subtitle', icon: 'mdi:lightbulb-group-outline'},
          {type: 'grid', columns: 3, square: false, cards: lights.map(id => roomTile(id, null, hass))});
      }
      for (const [title, icon, ids] of [['TV', 'mdi:television-play', tvs], ['Air conditioning', 'mdi:thermostat', climates]]) {
        if (!ids.length) continue;
        cards.push({type: 'heading', heading: title, heading_style: 'subtitle', icon}, ...ids.map(id => roomTile(id, null, hass)));
      }
      if (cards.length === 1) cards.push({type: 'markdown', content: 'Nothing to control in this room yet.'});
      sections.push({type: 'grid', cards});
    }
    const picked = full ? pickedViews(full, tabs) : [];
    if (!sections.length && !picked.length) sections.push({type: 'grid', cards: [{type: 'markdown', content: 'No rooms are set up for you yet. Ask a parent to add your room.'}]});
    const dashboard = {title: config.title || 'DwellDeck', views: sections.length ? [{title: 'My room', path: 'my-room', icon: 'mdi:bed', type: 'sections', max_columns: 2, sections}] : []};
    // More-info dialogs open everything about a device (history, related entities, settings links):
    // holding a tile toggles nothing extra and opens nothing.
    visit(dashboard, card => { if (card?.hold_action?.action === 'more-info') card.hold_action = {action: 'none'}; });
    lightsOneByOne(dashboard);
    phoneFriendlyPopups(dashboard);
    if (!config.theme && config.builtin_colors !== false) addBuiltinColors(dashboard);
    addLivingDesign(dashboard);
    const palette = paletteText(config.color_palette || DEFAULT_PALETTE);
    installShared(text => palette(refreshText(text)));
    const own = applyDwellPalette(applyDesignRefresh(dashboard, config), config.color_palette || DEFAULT_PALETTE);
    // The picked tabs come from the full build, already finished; only their order follows the full dashboard.
    return full ? {...full, views: [...own.views, ...picked]} : own;
  });
}
