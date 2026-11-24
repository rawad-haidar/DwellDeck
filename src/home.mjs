// Home: what needs you first, then the rooms in use, then outdoors, energy and shortcuts.
import {clone} from './util.mjs';
import {tvGroup} from './tv.mjs';
import {ROOM_COLORS} from './rooms.mjs';

const HOME_C = ROOM_COLORS;
const isPlaceholder = id => typeof id === 'string' && id.includes('.dwelldeck_slot_');
const heading = (text, icon) => ({type: 'heading', heading: text, icon, heading_style: 'title'});

// Runs inside a button-card template: greeting, time and a row of house status pills that open the matching page.
// Self-contained: serialised with toString.
function dwellGlance(states, hass, cfg) {
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const time = now.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
  const date = now.toLocaleDateString([], {weekday: 'long', day: 'numeric', month: 'long'});
  const reg = hass?.entities || {};
  const shown = id => !reg[id]?.hidden && !reg[id]?.hidden_by && !reg[id]?.entity_category && states[id];
  const all = Object.keys(states).filter(shown);
  const domain = d => all.filter(id => id.startsWith(d + '.'));
  const lights = (cfg.lights.length ? cfg.lights : domain('light').filter(id => !Array.isArray(states[id].attributes?.entity_id))).filter(id => states[id]);
  const lightsOn = lights.filter(id => states[id].state === 'on').length;
  const tvsOn = cfg.tvs.filter(id => states[id] && !['off', 'standby', 'unavailable', 'unknown'].includes(states[id].state)).length;
  const acOn = domain('climate').filter(id => {
    const e = states[id], a = e.attributes?.hvac_action;
    return a ? ['heating', 'cooling', 'drying', 'fan'].includes(a) : !['off', 'unavailable', 'unknown'].includes(e.state);
  }).length;
  const coversOpen = domain('cover').filter(id => states[id].state === 'open').length;
  const openings = domain('binary_sensor').filter(id => ['door', 'window', 'garage_door', 'opening'].includes(states[id].attributes?.device_class) && states[id].state === 'on').length;
  const alarm = cfg.alarm && states[cfg.alarm];
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const pills = [
    {icon: 'mdi:lightbulb-group', text: lightsOn ? plural(lightsOn, 'light on', 'lights on') : 'Lights off', on: lightsOn > 0, path: cfg.paths.lights},
    {icon: 'mdi:television', text: tvsOn ? plural(tvsOn, 'TV on', 'TVs on') : 'TVs off', on: tvsOn > 0, path: cfg.paths.media},
    {icon: 'mdi:air-conditioner', text: acOn ? plural(acOn, 'AC running', 'ACs running') : 'AC off', on: acOn > 0, path: cfg.paths.climate},
    {icon: 'mdi:curtains', text: coversOpen ? plural(coversOpen, 'curtain open', 'curtains open') : 'Curtains closed', on: coversOpen > 0, path: cfg.paths.curtains}
  ];
  if (openings) pills.push({icon: 'mdi:door-open', text: plural(openings, 'door or window open', 'doors or windows open'), alert: true, path: cfg.paths.security});
  if (alarm) {
    const s = alarm.state;
    const label = s === 'triggered' ? 'Alarm triggered' : s === 'disarmed' ? 'Alarm off' : s.startsWith('armed') ? 'Alarm on' : 'Alarm ' + s.replaceAll('_', ' ');
    pills.push({icon: s === 'disarmed' ? 'mdi:shield-off-outline' : 'mdi:shield-check', text: label, on: s.startsWith('armed'), alert: s === 'triggered', path: cfg.paths.security});
  }
  const go = path => `history.pushState(null,'','${path}');window.dispatchEvent(new CustomEvent('location-changed'));`;
  const pill = p => `<button class="pill${p.alert ? ' alert' : p.on ? ' on' : ''}" onclick="event.stopPropagation();${go(p.path)}"><ha-icon icon="${p.icon}"></ha-icon><span>${p.text}</span></button>`;
  return `<style>
    .g{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:18px 28px;text-align:left}
    .when{min-width:200px}
    .hi{font-size:15px;color:${cfg.c.muted};margin:0 0 2px}
    .time{font-size:56px;line-height:1;font-weight:600;letter-spacing:-1.5px;color:${cfg.c.text};font-variant-numeric:tabular-nums}
    .date{font-size:15px;color:${cfg.c.muted};margin-top:8px}
    .pills{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;flex:1 1 320px}
    .pill{display:flex;align-items:center;gap:8px;height:40px;padding:0 14px;border-radius:999px;cursor:pointer;font:inherit;font-size:14px;
      color:${cfg.c.muted};background:rgba(0,0,0,.18);border:1px solid ${cfg.c.line};white-space:nowrap}
    .pill ha-icon{--mdc-icon-size:18px}
    .pill.on{color:${cfg.c.onText};background:rgba(213,167,76,.14);border-color:${cfg.c.on}}
    .pill.alert{color:#fff;background:rgba(255,120,133,.22);border-color:${cfg.c.alert}}
    .pill:focus-visible{outline:2px solid ${cfg.c.onText};outline-offset:2px}
    @media (max-width:600px){.time{font-size:44px}.pills{justify-content:flex-start}}
  </style>
  <div class="g"><div class="when"><div class="hi">${greeting}</div><div class="time">${time}</div><div class="date">${date}</div></div>
  <div class="pills">${pills.map(pill).join('')}</div></div>`;
}

function glanceCard(cfg) {
  return {
    type: 'custom:button-card', show_name: false, show_icon: false, show_state: false, show_label: false,
    tap_action: {action: 'none'}, hold_action: {action: 'none'}, triggers_update: 'all', variables: {dwell_static: true},
    custom_fields: {glance: `[[[ return (${dwellGlance.toString()})(states, hass, ${JSON.stringify(cfg)}); ]]]`},
    styles: {
      card: [{padding: '22px 24px'}, {'border-radius': '20px'}, {background: `linear-gradient(135deg,${HOME_C.surface},${HOME_C.card})`},
        {border: `1px solid ${HOME_C.line}`}, {'box-shadow': 'none'}, {cursor: 'default'}],
      grid: [{'grid-template-areas': '"glance"'}, {'grid-template-columns': '1fr'}],
      custom_fields: {glance: [{width: '100%'}]}
    },
    grid_options: {columns: 'full', rows: 'auto'}
  };
}

// Energy readings side by side; each opens its sensor.
function dwellEnergy(states, cfg) {
  const items = cfg.items.filter(item => states[item.id]);
  if (!items.length) return `<div style="color:${cfg.c.muted};font-size:14px">Choose energy sensors in DwellDeck setup.</div>`;
  const value = id => {
    const e = states[id];
    if (['unknown', 'unavailable'].includes(e.state)) return '—';
    const n = Number(e.state), unit = e.attributes?.unit_of_measurement || '';
    if (!Number.isFinite(n)) return e.state;
    if (unit === 'W' && Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + '<small> kW</small>';
    return (Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10) + `<small>${unit === '%' ? '%' : ' ' + unit}</small>`;
  };
  const open = id => `event.stopPropagation();this.dispatchEvent(new CustomEvent('hass-more-info',{detail:{entityId:'${id}'},bubbles:true,composed:true}));`;
  return `<style>
    .e{display:grid;grid-template-columns:repeat(${items.length},minmax(0,1fr));gap:8px}
    .s{all:unset;box-sizing:border-box;cursor:pointer;padding:12px;border-radius:14px;background:rgba(0,0,0,.18);text-align:left;min-width:0}
    .s:focus-visible{outline:2px solid ${cfg.c.onText};outline-offset:2px}
    .s ha-icon{--mdc-icon-size:20px;color:${cfg.c.muted}}
    .v{font-size:22px;font-weight:600;color:${cfg.c.text};margin-top:6px;font-variant-numeric:tabular-nums;white-space:nowrap}
    .v small{font-size:13px;font-weight:500;color:${cfg.c.muted}}
    .l{font-size:13px;color:${cfg.c.muted};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  </style><div class="e">${items.map(item => `<button class="s" onclick="${open(item.id)}"><ha-icon icon="${item.icon}"></ha-icon><div class="v">${value(item.id)}</div><div class="l">${item.name}</div></button>`).join('')}</div>`;
}

function energyCard(tiles) {
  const items = tiles.map(tile => ({id: tile.entity, name: tile.name || tile.entity, icon: tile.icon || 'mdi:flash'}));
  return {
    type: 'custom:button-card', show_name: false, show_icon: false, show_state: false, show_label: false,
    tap_action: {action: 'none'}, hold_action: {action: 'none'}, triggers_update: items.map(item => item.id), variables: {dwell_static: true},
    custom_fields: {energy: `[[[ return (${dwellEnergy.toString()})(states, ${JSON.stringify({items, c: HOME_C})}); ]]]`},
    styles: {
      card: [{padding: '10px'}, {'border-radius': '20px'}, {background: `linear-gradient(135deg,${HOME_C.surface},${HOME_C.card})`},
        {border: `1px solid ${HOME_C.line}`}, {'box-shadow': 'none'}, {cursor: 'default'}],
      grid: [{'grid-template-areas': '"energy"'}, {'grid-template-columns': '1fr'}],
      custom_fields: {energy: [{width: '100%'}]}
    },
    grid_options: {columns: 'full', rows: 'auto'}
  };
}

// Shortcuts share one size and one layout: icon on top, name, then a one-line summary.
function evenShortcut(card) {
  const keep = (list = [], drop) => list.filter(rule => !Object.keys(rule).some(key => drop.includes(key)));
  card.styles ||= {};
  card.styles.grid = [{'grid-template-areas': '"i" "n" "l"'}, {'grid-template-columns': '1fr'}, {'grid-template-rows': '40px min-content min-content'}, {'row-gap': '2px'}, {'align-content': 'space-between'}, {height: '100%'}];
  card.styles.card = [...keep(card.styles.card, ['padding', 'min-height', 'height', 'border-radius']),
    {padding: '14px'}, {height: '120px'}, {'box-sizing': 'border-box'}, {'border-radius': '20px'}];
  card.styles.img_cell = [{'justify-self': 'start'}, {width: '40px'}, {height: '40px'}, {'border-radius': '12px'}, {background: 'rgba(0,0,0,.18)'}];
  card.styles.icon = [...keep(card.styles.icon, ['width']), {width: '22px'}];
  card.styles.name = [...keep(card.styles.name, ['font-size', 'justify-self']), {'justify-self': 'start'}, {'font-size': '15px'}, {'margin-top': '8px'},
    {'white-space': 'nowrap'}, {overflow: 'hidden'}, {'text-overflow': 'ellipsis'}, {'max-width': '100%'}];
  card.styles.label = [...keep(card.styles.label, ['white-space', 'font-size', 'justify-self', 'line-height']), {'justify-self': 'start'},
    {'white-space': 'nowrap'}, {'font-size': '13px'}, {'max-width': '100%'}];
  if (typeof card.label === 'string' && card.label.startsWith('[[[')) {
    // The summary keeps its first line so every shortcut has the same height.
    card.label = card.label.replace(/^\[\[\[([\s\S]*)\]\]\]$/, (match, body) => `[[[ return String((()=>{${body}})() ?? '').split('\\n')[0]; ]]]`);
  }
  card.grid_options = {columns: 6, rows: 'auto'};
  return card;
}

// A room appears on Home while something in it is on. Visibility conditions only read states, so
// "on" here is: a light, switch or fan on, a TV or player in use, or air conditioning not off.
const activeCondition = id => {
  if (id.startsWith('media_player.')) return {condition: 'state', entity: id, state_not: ['off', 'standby', 'idle', 'unavailable', 'unknown']};
  if (id.startsWith('climate.')) return {condition: 'state', entity: id, state_not: ['off', 'unavailable', 'unknown']};
  return {condition: 'state', entity: id, state: 'on'};
};
const quietCondition = id => {
  if (id.startsWith('media_player.')) return {condition: 'state', entity: id, state: ['off', 'standby', 'idle', 'unavailable', 'unknown']};
  if (id.startsWith('climate.')) return {condition: 'state', entity: id, state: ['off', 'unavailable', 'unknown']};
  return {condition: 'state', entity: id, state_not: 'on'};
};

function quietCard(path) {
  return {
    type: 'custom:button-card', name: 'Everything is off', label: 'No lights, TVs or air conditioning are on. Open Rooms to turn something on.',
    icon: 'mdi:sleep', show_label: true, show_state: false, variables: {dwell_static: true},
    tap_action: {action: 'navigate', navigation_path: path}, hold_action: {action: 'none'},
    styles: {
      grid: [{'grid-template-areas': '"i n" "i l"'}, {'grid-template-columns': '48px 1fr'}, {gap: '0 12px'}],
      card: [{padding: '14px'}, {'border-radius': '20px'}, {background: 'rgba(0,0,0,.18)'}, {border: `1px dashed ${HOME_C.line}`}, {'box-shadow': 'none'}],
      img_cell: [{width: '48px'}, {height: '48px'}, {'border-radius': '14px'}, {background: 'rgba(0,0,0,.18)'}],
      icon: [{width: '24px'}, {color: HOME_C.muted}],
      name: [{'justify-self': 'start'}, {'font-size': '15px'}, {'font-weight': '600'}, {color: HOME_C.text}],
      label: [{'justify-self': 'start'}, {'text-align': 'left'}, {'white-space': 'normal'}, {'font-size': '13px'}, {color: HOME_C.muted}]
    },
    grid_options: {columns: 'full', rows: 'auto'}
  };
}

function activeRooms(output, prefix) {
  const roomsView = output.views.find(view => view.path === 'rooms');
  const rooms = (roomsView?.sections || []).flatMap(section => section.cards || []).filter(card => Array.isArray(card.variables?.dwell_active) && card.variables.dwell_active.length);
  if (!rooms.length) return [];
  const cards = rooms.map(room => {
    const card = clone(room);
    card.visibility = [{condition: 'or', conditions: room.variables.dwell_active.map(activeCondition)}];
    // Two rooms side by side on a wide screen, one per row on a phone, so names have room.
    card.grid_options = {columns: 12, rows: 'auto'};
    return card;
  });
  const quiet = quietCard(`${prefix}/rooms`);
  quiet.visibility = [{condition: 'and', conditions: [...new Set(rooms.flatMap(room => room.variables.dwell_active))].map(quietCondition)}];
  return [heading('Rooms in use', 'mdi:home-lightning-bolt-outline'), ...cards, quiet];
}

const tvLeads = hass => [...new Set(Object.keys(hass.states || {}).filter(id => id.startsWith('media_player.') && !hass.entities?.[id]?.disabled_by)
  .map(id => tvGroup(id, hass)[0]))]
  .filter(id => hass.states?.[id]?.attributes?.device_class === 'tv' || /\btv\b|_tv/i.test(id + ' ' + (hass.states?.[id]?.attributes?.friendly_name || '')));

// Rebuilds the Home view in order of importance. Every original card is kept; only the order and the
// surfaces change. Runs before unselected entities become setup hints.
export function designHome(output, {prefix, hass = {}}) {
  const home = output.views.find(view => view.path === 'home');
  if (!home?.sections?.length) return output;
  const cards = home.sections.flatMap(section => section.cards || []);
  const taken = new Set();
  const take = test => { const found = cards.filter(card => !taken.has(card) && test(card)); found.forEach(card => taken.add(card)); return found; };
  cards.filter(card => card.type === 'heading').forEach(card => taken.add(card));
  const clock = take(card => card.type === 'markdown' && (card.content || '').includes("now().strftime('%H:%M')"));
  const weather = take(card => typeof card.entity === 'string' && card.entity.startsWith('weather.'));
  const alerts = take(card => card.tap_action?.navigation_path?.endsWith('/notifications'));
  // Shortcuts are the page buttons that sit with the activity card; other cards that open a page stay where they belong.
  const shortcutSection = home.sections.find(section => section.cards?.some(card => alerts.includes(card)));
  const shortcuts = take(card => shortcutSection?.cards.includes(card) && card.type === 'custom:button-card' && card.tap_action?.action === 'navigate');
  const alarm = take(card => card.type === 'tile' && card.entity?.startsWith('alarm_control_panel.'));
  const energyTiles = take(card => card.type === 'tile' && card.entity?.startsWith('sensor.'));
  const latest = take(card => card.type === 'markdown');
  const climate = take(card => card.type === 'custom:button-card');
  const rest = cards.filter(card => !taken.has(card));

  const path = view => shortcuts.find(card => card.tap_action.navigation_path.endsWith('/' + view))?.tap_action.navigation_path || `${prefix}/${view}`;
  const lightsShortcut = shortcuts.find(card => card.tap_action.navigation_path.endsWith('/lighting'));
  const alarmId = alarm[0]?.entity || alerts[0]?.triggers_update?.find?.(id => id.startsWith('alarm_control_panel.'));
  const glance = glanceCard({
    lights: (lightsShortcut?.triggers_update || []).filter(id => id.startsWith('light.') && !isPlaceholder(id)),
    tvs: tvLeads(hass), alarm: isPlaceholder(alarmId) ? null : alarmId || null,
    paths: {lights: path('lighting'), media: path('media'), climate: path('climate'), curtains: path('curtains'), security: path('security')},
    c: HOME_C
  });
  for (const card of [...alerts, ...alarm, ...climate, ...latest]) {
    if (card.styles?.card) card.styles.card.push({'border-radius': '20px'});
    if (card.grid_options) card.grid_options = {columns: 'full', rows: 'auto'};
  }
  alerts.forEach(card => {
    card.name = 'Alerts';
    card.styles ||= {};
    card.styles.grid = [{'grid-template-areas': '"i n" "i l"'}, {'grid-template-columns': '40px 1fr'}, {'grid-template-rows': 'min-content 1fr'}, {gap: '0 12px'}, {'align-items': 'start'}];
    card.styles.card = [...(card.styles.card || []).filter(rule => !('min-height' in rule) && !('padding' in rule)), {padding: '14px'}];
    card.styles.img_cell = [{width: '40px'}, {height: '40px'}, {'border-radius': '12px'}, {background: 'rgba(0,0,0,.18)'}, {'align-self': 'start'}];
    card.styles.icon = [...(card.styles.icon || []).filter(rule => !('width' in rule)), {width: '22px'}];
  });
  const bound = energyTiles.filter(tile => !isPlaceholder(tile.entity));
  const energy = bound.length ? [energyCard(bound)] : energyTiles;
  const section = (items, span) => ({type: 'grid', ...(span ? {column_span: span} : {}), cards: items});
  const sections = [
    section([glance, ...activeRooms(output, prefix)], 2),
    // The weather sits top right, beside the glance card.
    section([heading('Outside', 'mdi:weather-partly-cloudy'), ...weather]),
    section([heading('Safety', 'mdi:shield-home-outline'), ...alerts, ...alarm, ...latest]),
    section([heading('Climate and energy', 'mdi:lightning-bolt-outline'), ...climate, ...energy]),
    section([heading('Shortcuts', 'mdi:view-grid-outline'), ...shortcuts.map(evenShortcut)])
  ];
  if (rest.length) sections.push(section([heading('More', 'mdi:dots-horizontal'), ...rest]));
  home.sections = sections.filter(item => item.cards.length > 1 || item.column_span);
  void clock;
  return output;
}
