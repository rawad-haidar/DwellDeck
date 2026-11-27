// Home Assistant registry discovery: areas, devices, rooms and entity selection.
import {clone, normalizeName} from './util.mjs';
import {SLOTS, ROOM_TEMPLATES} from './data.mjs';

export const ROOM_CONTROL_DOMAINS = ['cover', 'climate', 'scene', 'sensor', 'binary_sensor', 'media_player'];
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

export function usableRegistryEntity(entity, hass) {
  const device = hass.devices?.[entity.device_id];
  return !entity.disabled_by && !entity.hidden_by && !device?.disabled_by &&
    !hass.states?.[entity.entity_id]?.attributes?.restored;
}

// Indexes of the registries, built once per dashboard build and dropped when it ends (the registries
// can change between builds). Looking up "which entities does this device have" by scanning every
// entity for every room and every entity took most of the build on a large home.
let INDEXES = null;
export function withRegistryIndex(build) {
  const outer = INDEXES;
  INDEXES = outer || new WeakMap();
  try { return build(); } finally { INDEXES = outer; }
}
function registryIndex(hass) {
  const entities = hass?.entities || {};
  let index = INDEXES?.get(entities);
  if (index && index.devices === hass.devices && index.states === hass.states) return index;
  const devices = hass?.devices || {};
  index = {devices: hass?.devices, states: hass?.states, deviceDomains: new Map(), byArea: new Map()};
  for (const entity of Object.values(entities)) {
    const domain = entity.entity_id.split('.')[0];
    if (entity.device_id) {
      if (!index.deviceDomains.has(entity.device_id)) index.deviceDomains.set(entity.device_id, new Set());
      index.deviceDomains.get(entity.device_id).add(domain);
    }
    const area = entity.area_id || devices[entity.device_id]?.area_id;
    if (area && usableRegistryEntity(entity, hass)) {
      if (!index.byArea.has(area)) index.byArea.set(area, []);
      index.byArea.get(area).push(entity.entity_id);
    }
  }
  INDEXES?.set(entities, index);
  return index;
}
const deviceHas = (hass, deviceId, test) => [...(registryIndex(hass).deviceDomains.get(deviceId) || [])].some(test);

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
  if (entry?.device_id && deviceHas(hass, entry.device_id, domain => /^(camera|climate|media_player|vacuum|fan|water_heater|alarm_control_panel|lock|cover)$/.test(domain))) return false;
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

export function roomEntities(room, hass, domains = ['light']) {
  const areaIds = room.area ? (registryIndex(hass).byArea.get(room.area) || []).filter(id => domains.includes(id.split('.')[0])) : [];
  const excluded = new Set(room.exclude || []);
  return [...new Set([...areaIds,...(room.entities || [])])].filter(id => !excluded.has(id) && domains.includes(id.split('.')[0]) &&
    (!room.discover_lighting || domains.length !== 1 || domains[0] !== 'light' || lightingCandidate(id, hass)));
}
export function entityArea(id, hass) {
  const entry = hass.entities?.[id];
  return entry?.area_id || hass.devices?.[entry?.device_id]?.area_id;
}

export function entityLabels(id, hass) {
  const entry = hass.entities?.[id];
  return [...new Set([...(entry?.labels || []), ...(hass.devices?.[entry?.device_id]?.labels || [])])]
    .map(label => hass.labels?.[label]).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}

export function cameraEntity(id, hass) {
  const entry = hass.entities?.[id];
  const device = hass.devices?.[entry?.device_id];
  if (entityLabels(id, hass).some(label => normalizeName(label.name) === 'camera')) return true;
  if (['dahua', 'onvif', 'reolink', 'frigate', 'ezviz', 'ring'].includes(entry?.platform)) return true;
  return !!entry?.device_id && deviceHas(hass, entry.device_id, domain => domain === 'camera');
}

export function roomSensorCandidate(id, hass) {
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
export function availableAreaEntities(hass, domains) {
  return Object.values(hass.entities || {}).filter(entry =>
    domains.includes(entry.entity_id.split('.')[0]) && usableRegistryEntity(entry, hass))
    .map(entry => entry.entity_id);
}
export function sceneName(id, hass) {
  return normalizeName(`${id} ${hass.entities?.[id]?.name || ''} ${hass.entities?.[id]?.original_name || ''} ${hass.states?.[id]?.attributes?.friendly_name || ''}`);
}
