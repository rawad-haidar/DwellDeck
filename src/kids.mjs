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

export function kidsDashboard(config, hass, kid) {
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
    if (!sections.length) sections.push({type: 'grid', cards: [{type: 'markdown', content: 'No rooms are set up for you yet. Ask a parent to add your room.'}]});
    const dashboard = {title: config.title || 'DwellDeck', views: [{title: 'My room', path: 'my-room', icon: 'mdi:bed', type: 'sections', max_columns: 2, sections}]};
    // More-info dialogs open everything about a device (history, related entities, settings links):
    // holding a tile toggles nothing extra and opens nothing.
    visit(dashboard, card => { if (card?.hold_action?.action === 'more-info') card.hold_action = {action: 'none'}; });
    lightsOneByOne(dashboard);
    phoneFriendlyPopups(dashboard);
    if (!config.theme && config.builtin_colors !== false) addBuiltinColors(dashboard);
    addLivingDesign(dashboard);
    const palette = paletteText(config.color_palette || DEFAULT_PALETTE);
    installShared(text => palette(refreshText(text)));
    return applyDwellPalette(applyDesignRefresh(dashboard, config), config.color_palette || DEFAULT_PALETTE);
  });
}
