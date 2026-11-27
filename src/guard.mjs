// The guard: a Home Assistant automation that undoes changes a limited user makes to anything that
// is not theirs. Home Assistant lets every signed-in user control every entity; the limited users'
// dashboard only hides things. The guard is what actually keeps the boiler, valves, pool filter and
// other rooms' air conditioners as they were. Built from the Limited users settings and saved by
// the editor as "DwellDeck · Guard".
import {roomEntities, withRegistryIndex} from './discovery.mjs';
import {isTv, withoutDuplicatePlayers} from './tv.mjs';
import {kidPicked} from './kids.mjs';

export const GUARD_ID = 'dwelldeck_guard';
// Domains where a change by a limited user is undone unless the entity is one of theirs.
export const GUARDED_DOMAINS = ['switch', 'valve', 'climate', 'water_heater', 'fan', 'cover', 'lock',
  'alarm_control_panel', 'siren', 'automation', 'script', 'input_boolean'];

// What a limited user may use: their rooms' lights (including switches that work as lights), TVs and
// air conditioners. Each room's area is matched by id or by name.
export function allowedEntities(rooms, hass) {
  return withRegistryIndex(() => {
    const ids = [];
    for (const name of [].concat(rooms || [])) {
      const area = hass.areas?.[name] || Object.values(hass.areas || {}).find(a => String(a.name).toLowerCase() === String(name).toLowerCase());
      if (!area) continue;
      const room = {area: area.area_id, name: area.name, discover_lighting: true};
      ids.push(...roomEntities(room, hass),
        ...withoutDuplicatePlayers(roomEntities(room, hass, ['media_player']).filter(id => isTv(id, hass)), hass),
        ...roomEntities(room, hass, ['climate']), ...roomEntities(room, hass, ['cover']));
    }
    return [...new Set(ids)].sort();
  });
}

// users: Home Assistant's user list (config/auth/list), to turn names written in YAML into ids.
export function guardAutomation(config, hass, users = []) {
  const userId = kid => users.find(user => user.id === kid.user || String(user.name).toLowerCase() === String(kid.user).toLowerCase())?.id;
  const allowed = {};
  for (const kid of config.kids || []) {
    const id = userId(kid);
    if (!id) continue;
    const picked = kidPicked(kid, hass);
    allowed[id] = [...new Set([...picked.entities, ...allowedEntities(picked.areas, hass)])].sort();
  }
  const protectedIds = [...new Set(config.protected || [])].sort();
  const domains = GUARDED_DOMAINS;
  return {
    alias: 'DwellDeck · Guard',
    description: 'Created by DwellDeck from Edit dashboard → Limited users. Undoes changes a limited user makes to devices that are not in their rooms (boiler, valves, pool, other rooms\' air conditioners, automations) or that are marked as protected, and leaves a notification. Change it in DwellDeck, not here.',
    mode: 'queued', max: 50,
    variables: {allowed, protected: protectedIds, guarded_domains: domains},
    triggers: [{trigger: 'event', event_type: 'state_changed'}],
    conditions: [
      {condition: 'template', value_template: '{{ trigger.event.context.user_id in allowed }}'},
      {condition: 'template', value_template: '{{ trigger.event.data.old_state is not none and trigger.event.data.new_state is not none }}'},
      {condition: 'template', value_template: "{% set id = trigger.event.data.entity_id %}{{ id in protected or (id not in allowed[trigger.event.context.user_id] and id.split('.')[0] in guarded_domains) }}"}
    ],
    actions: [
      {variables: {id: '{{ trigger.event.data.entity_id }}', old: '{{ trigger.event.data.old_state }}'}},
      {choose: [
        {conditions: "{{ id.startswith('climate.') }}", sequence: [
          {action: 'climate.set_hvac_mode', target: {entity_id: '{{ id }}'}, data: {hvac_mode: '{{ old.state }}'}},
          {if: '{{ old.attributes.temperature is not none }}', then: [
            {action: 'climate.set_temperature', target: {entity_id: '{{ id }}'}, data: {temperature: '{{ old.attributes.temperature }}'}}]}]},
        {conditions: "{{ id.startswith('valve.') }}", sequence: [
          {action: "valve.{{ 'open_valve' if old.state == 'open' else 'close_valve' }}", target: {entity_id: '{{ id }}'}}]},
        {conditions: "{{ id.startswith('cover.') }}", sequence: [
          {action: "cover.{{ 'open_cover' if old.state in ['open', 'opening'] else 'close_cover' }}", target: {entity_id: '{{ id }}'}}]},
        {conditions: "{{ id.startswith('lock.') }}", sequence: [
          {action: "lock.{{ 'lock' if old.state == 'locked' else 'unlock' }}", target: {entity_id: '{{ id }}'}}]},
        {conditions: "{{ id.startswith('alarm_control_panel.') }}", sequence: [
          {action: 'persistent_notification.create', data: {title: 'Alarm changed by a limited user', message: "{{ state_attr(id, 'friendly_name') or id }} was changed from {{ old.state }} to {{ states(id) }}. Check it."}}]},
        {conditions: "{{ old.state in ['on', 'off'] }}", sequence: [
          {action: "homeassistant.turn_{{ old.state }}", target: {entity_id: '{{ id }}'}}]}
      ]},
      {action: 'persistent_notification.create', data: {
        title: 'DwellDeck · Blocked change',
        message: "{{ states.person | selectattr('attributes.user_id', 'eq', trigger.event.context.user_id) | map(attribute='name') | first | default('A limited user') }} changed {{ state_attr(id, 'friendly_name') or id }}. It was set back."}}
    ]
  };
}
