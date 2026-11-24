// Reorganises generated views (rooms, lights, curtains, media, cameras, climate).
import {clone, listPattern, visit} from './util.mjs';
import {roomEntities, entityArea, roomSensorCandidate, availableAreaEntities, sceneName} from './discovery.mjs';
import {roomTile, areaRoomSections, stateCardStyle, richEntityCard, floorEntitySections, updateClimateStatus, setCardWidth, organizedEntitySections} from './cards.mjs';

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

export function rebuildRichAreaViews(output, config, hass, prototype, lightIds) {
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
