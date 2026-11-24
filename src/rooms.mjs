// Rooms page design: each room card is a glanceable summary with one quick action, and each room
// opens with a compact status strip instead of rows of sensor tiles.

const ROOM_COLORS = {
  surface: '#1b2d40', surfaceEnd: '#172638', card: '#101c2b', text: '#edf5ff', muted: '#91a8bd',
  line: 'rgba(156,199,225,.12)', onBg: '#493b24', on: '#d5a74c', onText: '#efc875', active: '#39e2bc', alert: '#ff7885'
};

// Runs inside a button-card template: status chips (icon and text, never colour alone) for a room.
// Self-contained: serialised with toString.
function dwellRoomChips(states, cfg) {
  const esc = v => String(v).replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
  const live = id => states[id] && !['unknown', 'unavailable'].includes(states[id].state);
  const number = (value, digits = 0) => { const n = Number(value); return Number.isFinite(n) ? n.toFixed(digits).replace(/\.0$/, '') : null; };
  const chips = [];
  const chip = (icon, text, tone = '') => chips.push({icon, text, tone});
  const byClass = cls => cfg.sensors.filter(id => live(id) && states[id].attributes?.device_class === cls);
  const temp = byClass('temperature')[0];
  if (temp) chip('mdi:thermometer', `${number(states[temp].state, 1)}${states[temp].attributes?.unit_of_measurement || '°'}`);
  const humidity = byClass('humidity')[0];
  if (humidity) chip('mdi:water-percent', `${number(states[humidity].state)}%`);
  for (const id of cfg.climates.filter(live)) {
    const e = states[id];
    const action = e.attributes?.hvac_action;
    const target = number(e.attributes?.temperature);
    if (e.state === 'off') continue;
    const label = action === 'cooling' ? 'Cooling' : action === 'heating' ? 'Heating' : action === 'drying' ? 'Drying' : action === 'fan' ? 'Fan' : 'On';
    chip(action === 'heating' ? 'mdi:fire' : 'mdi:snowflake', `${label}${target ? ` ${target}°` : ''}`, 'on');
    break;
  }
  const playing = cfg.media.filter(id => live(id) && !['off', 'standby', 'idle'].includes(states[id].state));
  if (playing.length) chip('mdi:television-play', states[playing[0]].state === 'playing' ? 'Playing' : 'TV on', 'on');
  const open = cfg.covers.filter(id => live(id) && ['open', 'opening'].includes(states[id].state)).length;
  if (open) chip('mdi:curtains', `${open} open`);
  const presence = cfg.binary.filter(id => live(id) && ['motion', 'occupancy', 'presence'].includes(states[id].attributes?.device_class));
  if (presence.some(id => states[id].state === 'on')) chip('mdi:motion-sensor', 'Motion', 'active');
  const openings = cfg.binary.filter(id => live(id) && ['door', 'window', 'opening', 'garage_door'].includes(states[id].attributes?.device_class) && states[id].state === 'on');
  if (openings.length) chip('mdi:door-open', openings.length === 1 ? `${states[openings[0]].attributes?.device_class === 'window' ? 'Window' : 'Door'} open` : `${openings.length} open`, 'alert');
  const alarms = cfg.binary.filter(id => live(id) && ['smoke', 'gas', 'moisture', 'carbon_monoxide', 'problem', 'safety'].includes(states[id].attributes?.device_class) && states[id].state === 'on');
  if (alarms.length) chip('mdi:alert', 'Alert', 'alert');
  if (!chips.length) return cfg.strip ? `<div style="color:${cfg.c.muted};font-size:13px;text-align:left">No sensor readings in this room.</div>` : '';
  const color = tone => tone === 'on' ? cfg.c.onText : tone === 'active' ? cfg.c.active : tone === 'alert' ? cfg.c.alert : cfg.c.text;
  // Room cards show the most important chips first; the strip in a room shows them all.
  // On the card, the most important first: alerts and open doors, then temperature, air conditioning, TV, motion.
  const rank = ({icon}) => ['mdi:alert', 'mdi:door-open', 'mdi:thermometer', 'mdi:snowflake', 'mdi:fire', 'mdi:television-play', 'mdi:motion-sensor', 'mdi:water-percent', 'mdi:curtains'].indexOf(icon);
  const shown = cfg.strip ? chips : [...chips].sort((a, b) => rank(a) - rank(b));
  const items = shown.map(({icon, text, tone}) => `<span style="display:inline-flex;box-sizing:border-box;align-items:center;gap:5px;height:28px;padding:0 10px;border-radius:999px;
      background:rgba(0,0,0,.22);border:1px solid ${tone === 'alert' ? cfg.c.alert : cfg.c.line};color:${color(tone)};font-size:12.5px;font-weight:600;white-space:nowrap">
      <ha-icon icon="${icon}" style="--mdc-icon-size:16px"></ha-icon>${esc(text)}</span>`).join('');
  // On a card the row is exactly one chip high and wraps: chips that don't fit whole drop out of sight
  // instead of being cut off.
  return cfg.strip
    ? `<div style="display:flex;flex-wrap:wrap;gap:6px;width:100%;justify-content:flex-start">${items}</div>`
    : `<div style="display:flex;flex-wrap:wrap;gap:6px;width:100%;height:28px;overflow:hidden;justify-content:flex-start">${items}</div>`;
}

const chipsConfig = (controls, hass, strip = false) => ({
  sensors: controls.filter(id => id.startsWith('sensor.')),
  binary: controls.filter(id => id.startsWith('binary_sensor.')),
  climates: controls.filter(id => id.startsWith('climate.')),
  media: controls.filter(id => id.startsWith('media_player.')),
  covers: controls.filter(id => id.startsWith('cover.')),
  strip, c: ROOM_COLORS
});
const chipsTemplate = cfg => `[[[ return (${dwellRoomChips.toString()})(states, ${JSON.stringify(cfg)}); ]]]`;

// The room's lights button: turns everything off when anything is on, otherwise turns it on. The two
// buttons sit in one slot; Home Assistant's conditional cards show the one that applies.
function lightsButton(lights, action, icon, name) {
  return {
    type: 'custom:button-card', name, icon, show_name: false, show_state: false,
    variables: {dwell_static: true},
    // The target is worked out when tapped: off goes only to lights that are on, on only to reachable lights,
    // so an already-off or unreachable device can't fail the whole action.
    tap_action: {action: 'perform-action', perform_action: `homeassistant.${action}`, target: {entity_id: action === 'turn_off'
      ? `[[[ return ${JSON.stringify(lights)}.filter(id => states[id]?.state === 'on'); ]]]`
      : `[[[ return ${JSON.stringify(lights)}.filter(id => states[id] && !['unavailable','unknown'].includes(states[id].state)); ]]]`}},
    hold_action: {action: 'none'},
    styles: {
      card: [{width: '48px'}, {height: '48px'}, {padding: '0'}, {'border-radius': '50%'}, {'box-shadow': 'none'},
        {background: action === 'turn_off' ? ROOM_COLORS.on : 'transparent'}, {border: `1px solid ${action === 'turn_off' ? ROOM_COLORS.on : ROOM_COLORS.line}`}],
      icon: [{width: '24px'}, {color: action === 'turn_off' ? ROOM_COLORS.card : ROOM_COLORS.muted}]
    }
  };
}
const lightsSlot = lights => ({
  type: 'vertical-stack',
  cards: [
    {type: 'conditional', conditions: [{condition: 'or', conditions: lights.map(entity => ({condition: 'state', entity, state: 'on'}))}],
      card: lightsButton(lights, 'turn_off', 'mdi:lightbulb-group-off-outline', 'Turn the room\'s lights off')},
    {type: 'conditional', conditions: lights.map(entity => ({condition: 'state', entity, state_not: 'on'})),
      card: lightsButton(lights, 'turn_on', 'mdi:lightbulb-group-outline', 'Turn the room\'s lights on')}
  ]
});

// Restyles a room card: icon, name, a short summary, a lights button and status chips.
export function designRoomCard(card, {lights, controls, hass}) {
  const total = lights.length;
  // Active means something in the room is switched on: lights, a TV or player, air conditioning running, a switch.
  // Sensors, doors and open curtains are shown as chips, not as activity.
  const ids = [...new Set([...lights, ...controls.filter(id => /^(media_player|climate|switch|fan)\./.test(id) && !hass.entities?.[id]?.entity_category)])];
  const active = `(()=>{const ids=${JSON.stringify(ids)}; return ids.some(id=>{const e=states[id]; if(!e) return false;
    if(id.startsWith('climate.')) return ['heating','cooling','drying','fan'].includes(e.attributes?.hvac_action);
    if(id.startsWith('media_player.')) return !['off','standby','idle','unavailable','unknown'].includes(e.state);
    return e.state==='on';});})()`;
  card.show_label = true;
  card.label = total
    ? `[[[ const ids=${JSON.stringify(lights)}; const on=ids.filter(id=>states[id]?.state==='on').length; return on ? on + ' of ' + ids.length + (ids.length === 1 ? ' light on' : ' lights on') : 'All lights off'; ]]]`
    : (controls.length ? 'No lights' : 'Nothing assigned');
  card.custom_fields = {chips: chipsTemplate(chipsConfig(controls, hass))};
  const areas = ['"i n power"', '"i l power"', '"chips chips chips"'];
  if (total) card.custom_fields.power = {card: lightsSlot(lights)};
  card.triggers_update = [...new Set([...lights, ...controls])];
  // Every room card has the same fixed height, whatever it shows, so cards line up in every row.
  card.grid_options = {columns: 6, rows: 'auto'};
  card.styles = {
    grid: [{'grid-template-areas': areas.join(' ')}, {'grid-template-columns': '48px minmax(0,1fr) 48px'}, {'grid-template-rows': '24px 24px 1fr'}, {gap: '0 12px'}, {'align-items': 'center'}, {height: '100%'}, {'min-height': '0'}],
    card: [{padding: '14px'}, {height: '128px'}, {'min-height': '128px'}, {'box-sizing': 'border-box'}, {overflow: 'hidden'}, {'border-radius': '20px'}, {'text-align': 'left'}, {'box-shadow': 'none'},
      {background: `[[[ return ${active} ? 'linear-gradient(135deg,${ROOM_COLORS.onBg},${ROOM_COLORS.surfaceEnd})' : 'linear-gradient(135deg,${ROOM_COLORS.surface},${ROOM_COLORS.card})'; ]]]`},
      {border: `[[[ return ${active} ? '1px solid ${ROOM_COLORS.on}' : '1px solid ${ROOM_COLORS.line}'; ]]]`}],
    img_cell: [{width: '48px'}, {height: '48px'}, {'border-radius': '14px'},
      {background: `[[[ return ${active} ? 'rgba(213,167,76,.18)' : 'rgba(0,0,0,.18)'; ]]]`}],
    icon: [{width: '26px'}, {color: `[[[ return ${active} ? '${ROOM_COLORS.onText}' : '${ROOM_COLORS.muted}'; ]]]`}],
    // One line, so every card lines up; the name has the full width between the icon and the lights button.
    name: [{'justify-self': 'start'}, {'align-self': 'end'}, {'font-size': '16px'}, {'font-weight': '600'}, {color: ROOM_COLORS.text},
      {'white-space': 'nowrap'}, {overflow: 'hidden'}, {'text-overflow': 'ellipsis'}, {'max-width': '100%'}, {'text-align': 'left'}],
    label: [{'justify-self': 'start'}, {'align-self': 'start'}, {'font-size': '13px'}, {color: ROOM_COLORS.muted}, {'white-space': 'nowrap'},
      {overflow: 'hidden'}, {'text-overflow': 'ellipsis'}, {'max-width': '100%'}],
    custom_fields: {power: [{'justify-self': 'end'}, {'align-self': 'center'}, {width: '48px'}, {height: '48px'}],
      chips: [{'justify-self': 'stretch'}, {'align-self': 'end'}, {'min-width': '0'}, {height: '28px'}, {overflow: 'hidden'}]}
  };
  return card;
}

// The status strip at the top of a room: every reading in one compact row instead of sensor tiles.
export function roomStatusStrip(controls, hass) {
  const watched = controls.filter(id => /^(sensor|binary_sensor|climate|media_player|cover)\./.test(id));
  return {
    type: 'custom:button-card', show_name: false, show_icon: false, show_state: false, tap_action: {action: 'none'}, hold_action: {action: 'none'},
    triggers_update: watched, variables: {dwell_static: true},
    custom_fields: {chips: chipsTemplate(chipsConfig(controls, hass, true))},
    styles: {card: [{padding: '12px 14px'}, {'border-radius': '16px'}, {background: 'rgba(0,0,0,.18)'}, {border: `1px solid ${ROOM_COLORS.line}`}, {'box-shadow': 'none'}],
      grid: [{'grid-template-areas': '"chips"'}, {'grid-template-columns': '1fr'}], custom_fields: {chips: [{width: '100%'}]}},
    grid_options: {columns: 'full', rows: 'auto'}
  };
}
