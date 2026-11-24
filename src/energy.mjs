// Energy page: a live power flow between solar, battery, grid and the house, today's totals, and graphs of
// the last 30 days. Inverters are found by their sensor names (Solarman / Deye style: <inverter>_pv_power,
// _battery_power, _grid_power, _power, _battery, _today_production ...); several inverters are added up.
import {ROOM_COLORS} from './rooms.mjs';

const EN_C = ROOM_COLORS;
// Height shared by the top row (flow, today, battery), so they line up.
const ENERGY_TOP = 336;
const enHeading = (text, icon) => ({type: 'heading', heading: text, icon, heading_style: 'title'});

// Finds each inverter by its PV power sensor and collects its sensors. Groups and helpers that only
// mirror a PV sensor are skipped: an inverter also reports battery or grid power.
export function discoverInverters(hass = {}) {
  const states = hass.states || {};
  const has = id => !!states[id] && !hass.entities?.[id]?.disabled_by;
  const prefixes = Object.keys(states).filter(id => /^sensor\..+_pv_power$/.test(id)).map(id => id.slice(0, -'_pv_power'.length))
    .filter(prefix => has(`${prefix}_battery_power`) || has(`${prefix}_grid_power`)).sort();
  const pick = (prefix, ...names) => names.map(name => `${prefix}_${name}`).find(has) || null;
  return prefixes.map(prefix => ({
    name: (states[`${prefix}_pv_power`].attributes?.friendly_name || prefix).replace(/\s*pv power$/i, ''),
    pv: pick(prefix, 'pv_power'),
    battery: pick(prefix, 'battery_power'),
    grid: pick(prefix, 'grid_power'),
    // The inverter's output is what the house uses; some inverters report a wrong load power.
    load: pick(prefix, 'power', 'output_power', 'load_power'),
    soc: pick(prefix, 'battery', 'battery_soc'),
    today: {
      solar: pick(prefix, 'today_production', 'today_energy'), home: pick(prefix, 'today_load_consumption'),
      charge: pick(prefix, 'today_battery_charge'), discharge: pick(prefix, 'today_battery_discharge'),
      import: pick(prefix, 'today_energy_import'), export: pick(prefix, 'today_energy_export')
    },
    total: {
      solar: pick(prefix, 'total_production'), home: pick(prefix, 'total_load_consumption'),
      charge: pick(prefix, 'total_battery_charge'), discharge: pick(prefix, 'total_battery_discharge'),
      import: pick(prefix, 'total_energy_import'), export: pick(prefix, 'total_energy_export')
    }
  }));
}

export const ENERGY_TOTALS = ['solar', 'home', 'charge', 'discharge', 'import', 'export'];

// What the dashboard editor shows: the chosen sensors, or what would be found, so they can be checked and changed.
export function energyEditorValues(config = {}, hass = {}) {
  const setup = energySetup(config, hass);
  const chosen = config.energy || {};
  return {
    solar: setup.solar, home: setup.home, battery: setup.battery, grid: setup.grid, battery_soc: setup.soc,
    battery_charging: chosen.battery_charging || 'negative', grid_import: chosen.grid_import || 'positive',
    ...Object.fromEntries(ENERGY_TOTALS.flatMap(key => [[`today_${key}`, setup.today[key]], [`total_${key}`, setup.total[key]]]))
  };
}

// What the page shows: chosen sensors (DwellDeck setup) win, then inverters, then the page's own sensors.
export function energySetup(config = {}, hass = {}, slots = {}) {
  const chosen = config.energy || {};
  const inverters = discoverInverters(hass);
  const list = (key, from) => (chosen[key]?.length ? chosen[key] : inverters.map(inv => from(inv)).filter(Boolean));
  const fallback = (ids, id) => ids.length ? ids : (id && !id.includes('.dwelldeck_slot_') ? [id] : []);
  return {
    inverters: inverters.map(inv => inv.name),
    solar: fallback(list('solar', inv => inv.pv), slots.solar),
    home: fallback(list('home', inv => inv.load), slots.home),
    battery: list('battery', inv => inv.battery),
    grid: list('grid', inv => inv.grid),
    soc: fallback(chosen.battery_soc ? [].concat(chosen.battery_soc) : inverters.map(inv => inv.soc).filter(Boolean), slots.soc),
    // Sign conventions: Deye and most hybrid inverters report battery discharge and grid import as positive.
    batteryCharging: chosen.battery_charging === 'positive' ? 1 : -1,
    gridImport: chosen.grid_import === 'negative' ? -1 : 1,
    today: Object.fromEntries(ENERGY_TOTALS.map(key => [key, chosen[`today_${key}`]?.length ? chosen[`today_${key}`] : inverters.map(inv => inv.today[key]).filter(Boolean)])),
    total: Object.fromEntries(ENERGY_TOTALS.map(key => [key, chosen[`total_${key}`]?.length ? chosen[`total_${key}`] : inverters.map(inv => inv.total[key]).filter(Boolean)]))
  };
}

// Runs inside a button-card template: the power flow. Solar on top, grid left, house right, battery below,
// the inverter in the middle. Dots move the way power flows, faster when more flows.
// Self-contained: serialised with toString.
function dwellEnergyFlow(states, cfg) {
  const read = ids => {
    const live = ids.map(id => states[id]).filter(s => s && Number.isFinite(Number(s.state)));
    if (!live.length) return null;
    return live.reduce((sum, s) => {
      const n = Number(s.state), unit = s.attributes?.unit_of_measurement;
      return sum + (unit === 'kW' ? n * 1000 : unit === 'MW' ? n * 1e6 : n);
    }, 0);
  };
  const solar = read(cfg.solar), home = read(cfg.home), battery = read(cfg.battery), grid = read(cfg.grid);
  const socs = cfg.soc.map(id => Number(states[id]?.state)).filter(Number.isFinite);
  const soc = socs.length ? Math.round(socs.reduce((a, b) => a + b, 0) / socs.length) : null;
  const charge = battery === null ? null : battery * cfg.batteryCharging; // > 0 charging
  const gridIn = grid === null ? null : grid * cfg.gridImport; // > 0 importing
  const watts = w => w === null ? '—' : Math.abs(w) >= 1000 ? (Math.abs(w) / 1000).toFixed(Math.abs(w) >= 10000 ? 0 : 1) + ' kW' : Math.round(Math.abs(w)) + ' W';
  const IDLE = 15;
  // Positions in a 400 × 300 drawing.
  const P = {hub: [200, 150], solar: [200, 44], grid: [52, 150], home: [348, 150], battery: [200, 256]};
  const line = (from, to, w, color, id) => {
    const [x1, y1] = P[from], [x2, y2] = P[to];
    const on = w !== null && Math.abs(w) > IDLE;
    const forward = (w || 0) >= 0;
    const path = forward ? `M${x1},${y1} L${x2},${y2}` : `M${x2},${y2} L${x1},${y1}`;
    const dur = on ? Math.max(0.9, 3.2 - Math.log10(Math.abs(w)) * 0.6).toFixed(2) : 0;
    const dots = on ? [0, 1, 2].map(i => `<circle r="4" fill="${color}"><animateMotion dur="${dur}s" begin="-${(i * dur / 3).toFixed(2)}s" repeatCount="indefinite" path="${path}"/></circle>`).join('') : '';
    return `<path id="${id}" d="M${x1},${y1} L${x2},${y2}" stroke="${on ? color : cfg.c.line}" stroke-width="${on ? 2.5 : 1.5}" stroke-opacity="${on ? 0.55 : 1}" fill="none" stroke-linecap="round"/>${dots}`;
  };
  const C = {solar: '#f2c14e', grid: '#8fb8d0', home: '#efc875', battery: '#a8c49a'};
  const node = (key, icon, title, value, sub, color, active, entity) => {
    const [x, y] = P[key];
    return `<button class="node" style="left:${x / 4}%;top:${y / 3}%;--c:${color}" ${entity ? `data-entity="${entity}" onclick="event.stopPropagation();window.__dwellEnergy.info(this)"` : 'tabindex="-1"'}>
      <span class="ring${active ? ' on' : ''}"><ha-icon icon="${icon}"></ha-icon></span><span class="v">${value}</span><span class="t">${title}</span>${sub ? `<span class="s">${sub}</span>` : ''}</button>`;
  };
  window.__dwellEnergy = window.__dwellEnergy || {info(el) { el.dispatchEvent(new CustomEvent('hass-more-info', {detail: {entityId: el.dataset.entity}, bubbles: true, composed: true})); }};
  const batteryText = charge === null ? (soc === null ? 'Not set up' : '') : Math.abs(charge) <= IDLE ? 'Idle' : charge > 0 ? 'Charging' : 'Discharging';
  const gridText = gridIn === null ? 'Not set up' : Math.abs(gridIn) <= IDLE ? 'Idle' : gridIn > 0 ? 'Importing' : 'Exporting';
  const batteryIcon = soc === null ? 'mdi:battery' : `mdi:battery${soc >= 95 ? '' : '-' + Math.max(10, Math.round(soc / 10) * 10)}`;
  return `<style>
    .flow{position:relative;width:min(100%,${Math.round(cfg.height * 4 / 3)}px);aspect-ratio:4/3;margin:0 auto}
    .flow > svg{position:absolute;inset:0;width:100%;height:100%}
    .node{all:unset;position:absolute;transform:translate(-50%,-50%);display:grid;justify-items:center;gap:2px;text-align:center;cursor:pointer;min-width:84px}
    .node[tabindex="-1"]{cursor:default}
    .ring{display:grid;place-items:center;width:52px;height:52px;border-radius:50%;background:#101820;border:2px solid ${cfg.c.line};color:${cfg.c.muted}}
    .ring.on{border-color:var(--c);color:var(--c);box-shadow:0 0 18px color-mix(in srgb,var(--c) 35%,transparent)}
    .ring ha-icon{--mdc-icon-size:26px;width:26px;height:26px;display:block}
    .v{font-size:17px;font-weight:600;color:${cfg.c.text};font-variant-numeric:tabular-nums;white-space:nowrap}
    .t{font-size:12px;color:${cfg.c.muted}}
    .s{font-size:12px;color:var(--c);white-space:nowrap}
    .hub{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:#101820;border:1px solid ${cfg.c.line};color:${cfg.c.muted}}
    .hub ha-icon{--mdc-icon-size:22px;width:22px;height:22px;display:block}
    .node:focus-visible .ring{outline:2px solid ${cfg.c.onText};outline-offset:2px}
    @media (prefers-reduced-motion:reduce){.flow circle{display:none}}
  </style><div class="flow"><svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid meet">
    ${line('solar', 'hub', solar, C.solar, 'f1')}
    ${line('grid', 'hub', gridIn, C.grid, 'f2')}
    ${line('hub', 'home', home, C.home, 'f3')}
    ${line('hub', 'battery', charge, C.battery, 'f4')}
  </svg><span class="hub"><ha-icon icon="mdi:sine-wave"></ha-icon></span>
    ${node('solar', 'mdi:solar-power-variant', 'Solar', watts(solar), '', C.solar, (solar || 0) > IDLE, cfg.solar.length === 1 ? cfg.solar[0] : null)}
    ${node('grid', 'mdi:transmission-tower', 'Grid', watts(gridIn), gridText, C.grid, gridIn !== null && Math.abs(gridIn) > IDLE, cfg.grid.length === 1 ? cfg.grid[0] : null)}
    ${node('home', 'mdi:home-lightning-bolt', 'Home', watts(home), '', C.home, (home || 0) > IDLE, cfg.home.length === 1 ? cfg.home[0] : null)}
    ${node('battery', batteryIcon, 'Battery' + (soc !== null ? ' · ' + soc + '%' : ''), watts(charge), batteryText, C.battery, charge !== null && Math.abs(charge) > IDLE, cfg.soc[0] || null)}
  </div>`;
}

// Runs inside a button-card template: today's totals, added up over the inverters.
function dwellEnergyToday(states, cfg) {
  const sum = ids => {
    const live = ids.map(id => states[id]).filter(s => s && Number.isFinite(Number(s.state)));
    return live.length ? live.reduce((total, s) => total + Number(s.state) * (s.attributes?.unit_of_measurement === 'Wh' ? 0.001 : 1), 0) : null;
  };
  const kwh = v => v === null ? '—' : (v >= 100 ? Math.round(v) : v.toFixed(1)) + '<small> kWh</small>';
  const rows = [
    ['mdi:solar-power-variant', 'Solar produced', sum(cfg.today.solar), '#f2c14e'],
    ['mdi:home-lightning-bolt', 'Home used', sum(cfg.today.home), '#efc875'],
    ['mdi:battery-arrow-up', 'Battery charged', sum(cfg.today.charge), '#a8c49a'],
    ['mdi:battery-arrow-down', 'Battery discharged', sum(cfg.today.discharge), '#a8c49a'],
    ['mdi:transmission-tower-import', 'From the grid', sum(cfg.today.import), '#8fb8d0'],
    ['mdi:transmission-tower-export', 'To the grid', sum(cfg.today.export), '#8fb8d0']
  ].filter(row => row[2] !== null);
  if (!rows.length) return `<div style="color:${cfg.c.muted};font-size:14px;text-align:left">Today's totals appear when your inverter reports daily energy (for example <i>today production</i>).</div>`;
  return `<style>
    .tg{display:grid;grid-template-columns:1fr 1fr;gap:8px;text-align:left}
    .tc{padding:10px 12px;border-radius:14px;background:rgba(0,0,0,.18);min-width:0}
    .tc ha-icon{--mdc-icon-size:20px;width:20px;height:20px;display:block}
    .tv{font-size:20px;font-weight:600;color:${cfg.c.text};margin-top:6px;font-variant-numeric:tabular-nums;white-space:nowrap}
    .tv small{font-size:12px;font-weight:500;color:${cfg.c.muted}}
    .tl{font-size:12.5px;color:${cfg.c.muted};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  </style><div class="tg">${rows.map(([icon, label, value, color]) => `<div class="tc"><ha-icon icon="${icon}" style="color:${color}"></ha-icon><div class="tv">${kwh(value)}</div><div class="tl">${label}</div></div>`).join('')}</div>`;
}

const panel = (field, fn, cfg, watched, height) => ({
  type: 'custom:button-card', show_name: false, show_icon: false, show_state: false, show_label: false,
  tap_action: {action: 'none'}, hold_action: {action: 'none'}, triggers_update: watched, variables: {dwell_static: true},
  custom_fields: {[field]: `[[[ return (${fn.toString()})(states, ${JSON.stringify(cfg)}); ]]]`},
  styles: {
    card: [{padding: '16px'}, {height: `${height}px`}, {'box-sizing': 'border-box'}, {overflow: 'hidden'}, {'border-radius': '20px'},
      {background: `linear-gradient(135deg,${EN_C.surface},${EN_C.card})`}, {border: `1px solid ${EN_C.line}`}, {'box-shadow': 'none'}, {cursor: 'default'}],
    grid: [{'grid-template-areas': `"${field}"`}, {'grid-template-columns': '1fr'}, {'align-content': 'center'}, {height: '100%'}],
    custom_fields: {[field]: [{width: '100%'}, {'pointer-events': 'auto'}]}
  },
  grid_options: {columns: 'full', rows: 'auto'}
});

// A Home Assistant statistics graph over the last 30 days (long-term statistics: fast for a month).
const monthGraph = (title, entities, stat_types, chart_type, extra = {}) => ({
  type: 'statistics-graph', title, entities, days_to_show: 30, period: 'day', stat_types, chart_type,
  hide_legend: entities.length < 2, grid_options: {columns: 'full', rows: 'auto'}, ...extra
});
const named = (ids, hass, label) => ids.map(id => ({entity: id, name: ids.length > 1
  ? `${label} · ${(hass.states?.[id]?.attributes?.friendly_name || id).replace(/^(.*?inverter\s+\w+).*/i, '$1')}` : label}));

export function designEnergy(output, {config = {}, hass = {}}) {
  const view = output.views.find(item => item.path === 'energy');
  if (!view?.sections?.length) return output;
  const graphs = view.sections.flatMap(section => section.cards || []).filter(card => card.type === 'custom:mini-graph-card');
  const slotOf = name => graphs.flatMap(card => card.entities || []).find(row => row.name?.toLowerCase().includes(name))?.entity;
  const setup = energySetup(config, hass, {solar: slotOf('solar'), home: slotOf('load'), soc: slotOf('battery')});
  const watched = [...new Set([...setup.solar, ...setup.home, ...setup.battery, ...setup.grid, ...setup.soc])];
  const todayIds = [...new Set(Object.values(setup.today).flat())];
  const c = {text: EN_C.text, muted: EN_C.muted, line: EN_C.line, on: EN_C.on, onText: EN_C.onText};
  const flow = panel('flow', dwellEnergyFlow, {...setup, today: undefined, total: undefined, height: ENERGY_TOP - 32, c}, watched, ENERGY_TOP);
  const today = panel('today', dwellEnergyToday, {today: setup.today, c}, todayIds, ENERGY_TOP);

  // Last 30 days: daily energy from the inverters' running totals when there are any; otherwise the page's
  // own graphs, stretched to 30 days.
  const daily = [];
  if (setup.total.solar.length || setup.total.home.length) {
    daily.push(monthGraph('Solar and home, kWh per day', [...named(setup.total.solar, hass, 'Solar'), ...named(setup.total.home, hass, 'Home')], ['change'], 'bar'));
  }
  if (setup.total.charge.length || setup.total.import.length) {
    daily.push(monthGraph('Battery and grid, kWh per day', [...named(setup.total.charge, hass, 'Charged'), ...named(setup.total.discharge, hass, 'Discharged'),
      ...named(setup.total.import, hass, 'From grid'), ...named(setup.total.export, hass, 'To grid')], ['change'], 'bar'));
  }
  const power = [...setup.solar, ...setup.home].length
    ? [monthGraph('Solar and home power, daily average', [...named(setup.solar, hass, 'Solar'), ...named(setup.home, hass, 'Home')], ['mean'], 'line')] : [];
  const battery = setup.soc.length ? [monthGraph('Battery level, daily low, average and high', setup.soc.slice(0, 1).map(entity => ({entity, name: 'Battery'})), ['min', 'mean', 'max'], 'line')] : [];
  const fallback = daily.length || power.length ? [] : graphs.map(card => ({...card, hours_to_show: 720, points_per_hour: 0.25,
    name: String(card.name || '').replace(/ · 24h$/, '').replace(/ now$/, '') + ' · 30 days', grid_options: {columns: 'full', rows: 'auto'}}));

  const section = (items, span) => ({type: 'grid', ...(span ? {column_span: span} : {}), cards: items});
  const sections = [
    section([enHeading('Power flow', 'mdi:transit-connection-variant'), flow], 2),
    section([enHeading('Today', 'mdi:calendar-today'), today]),
    // One full-width section: graphs two across on a wide screen, one per row on a phone.
    section([enHeading('Last 30 days', 'mdi:chart-bar'), ...[...daily, ...power, ...battery, ...fallback].map(card => ({...card, grid_options: {columns: 18, rows: 'auto'}}))], 3)
  ];
  view.max_columns = 3;
  view.sections = sections.filter(item => item.cards.length > 1);
  return output;
}
