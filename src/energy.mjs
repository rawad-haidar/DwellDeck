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
export const ENERGY_COMBINE = ['solar_combine', 'home_combine', 'battery_combine', 'grid_combine', 'battery_soc_combine', 'energy_combine'];

// Short names for sensors drawn one per line: the words that differ between them ("Master", "Slave").
export function shortNames(ids, hass = {}) {
  const words = ids.map(id => (hass.states?.[id]?.attributes?.friendly_name || id.split('.')[1].replaceAll('_', ' ')).split(/\s+/));
  const out = {};
  ids.forEach((id, i) => {
    const differ = words[i].filter(word => words.some((other, j) => j !== i && !other.includes(word)));
    out[id] = (differ.length && ids.length > 1 ? differ : words[i]).join(' ');
  });
  return out;
}

// What the dashboard editor shows: the chosen sensors, or what would be found, so they can be checked and changed.
export function energyEditorValues(config = {}, hass = {}) {
  const setup = energySetup(config, hass);
  const chosen = config.energy || {};
  return {
    solar: setup.solar, home: setup.home, battery: setup.battery, grid: setup.grid, battery_soc: setup.soc,
    battery_charging: chosen.battery_charging || 'negative', grid_import: chosen.grid_import || 'positive',
    ...Object.fromEntries(ENERGY_COMBINE.map(key => [key, setup.modes[{solar_combine: 'solar', home_combine: 'home', battery_combine: 'battery', grid_combine: 'grid', battery_soc_combine: 'soc', energy_combine: 'energy'}[key]]])),
    ...Object.fromEntries(ENERGY_TOTALS.flatMap(key => [[`today_${key}`, setup.today[key]], [`total_${key}`, setup.total[key]]]))
  };
}

// What the page shows: chosen sensors (DwellDeck setup) win, then inverters, then the page's own sensors.
export function energySetup(config = {}, hass = {}, slots = {}) {
  const chosen = config.energy || {};
  const inverters = discoverInverters(hass);
  const list = (key, from) => (chosen[key]?.length ? chosen[key] : inverters.map(inv => from(inv)).filter(Boolean));
  const fallback = (ids, id) => ids.length ? ids : (id && !id.includes('.dwelldeck_slot_') ? [id] : []);
  const setup = {
    inverters: inverters.map(inv => inv.name),
    solar: fallback(list('solar', inv => inv.pv), slots.solar),
    home: fallback(list('home', inv => inv.load), slots.home),
    battery: list('battery', inv => inv.battery),
    grid: list('grid', inv => inv.grid),
    soc: fallback(chosen.battery_soc ? [].concat(chosen.battery_soc) : inverters.map(inv => inv.soc).filter(Boolean), slots.soc),
    // How several sensors in one field combine: added up, averaged, or one line each.
    modes: {solar: chosen.solar_combine || 'sum', home: chosen.home_combine || 'sum', battery: chosen.battery_combine || 'sum', grid: chosen.grid_combine || 'sum',
      soc: chosen.battery_soc_combine || 'average', energy: chosen.energy_combine || 'sum'},
    // Sign conventions: Deye and most hybrid inverters report battery discharge and grid import as positive.
    batteryCharging: chosen.battery_charging === 'positive' ? 1 : -1,
    gridImport: chosen.grid_import === 'negative' ? -1 : 1,
    today: Object.fromEntries(ENERGY_TOTALS.map(key => [key, chosen[`today_${key}`]?.length ? chosen[`today_${key}`] : inverters.map(inv => inv.today[key]).filter(Boolean)])),
    total: Object.fromEntries(ENERGY_TOTALS.map(key => [key, chosen[`total_${key}`]?.length ? chosen[`total_${key}`] : inverters.map(inv => inv.total[key]).filter(Boolean)]))
  };
  setup.names = Object.assign({}, ...[setup.solar, setup.home, setup.battery, setup.grid, setup.soc, ...Object.values(setup.today), ...Object.values(setup.total)]
    .map(list => shortNames(list, hass)));
  return setup;
}

// Runs inside a button-card template: the power flow. Solar on top, grid left, house right, battery below,
// the inverter in the middle. Dots move the way power flows, faster when more flows.
// Self-contained: serialised with toString.
function dwellEnergyFlow(states, cfg) {
  // Added up, unless setup says to average this field.
  const read = (ids, mode) => {
    const live = ids.map(id => states[id]).filter(s => s && Number.isFinite(Number(s.state)));
    if (!live.length) return null;
    const total = live.reduce((sum, s) => {
      const n = Number(s.state), unit = s.attributes?.unit_of_measurement;
      return sum + (unit === 'kW' ? n * 1000 : unit === 'MW' ? n * 1e6 : n);
    }, 0);
    return mode === 'average' ? total / live.length : total;
  };
  const solar = read(cfg.solar, cfg.modes.solar), home = read(cfg.home, cfg.modes.home), battery = read(cfg.battery, cfg.modes.battery), grid = read(cfg.grid, cfg.modes.grid);
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
  const C = {solar: '#f2c14e', grid: '#8fb8d0', home: '#b9a3e3', battery: '#a8c49a'};
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
    const total = live.reduce((t, s) => t + Number(s.state) * (s.attributes?.unit_of_measurement === 'Wh' ? 0.001 : 1), 0);
    return live.length ? (cfg.mode === 'average' ? total / live.length : total) : null;
  };
  const kwh = v => v === null ? '—' : (v >= 100 ? Math.round(v) : v.toFixed(1)) + '<small> kWh</small>';
  const rows = [
    ['mdi:solar-power-variant', 'Solar produced', sum(cfg.today.solar), '#f2c14e'],
    ['mdi:home-lightning-bolt', 'Home used', sum(cfg.today.home), '#b9a3e3'],
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

// Runs inside a button-card template (`card` is the button-card element): energy history for a range picked
// from a dropdown (today, yesterday, 2 and 3 days, 1–3 weeks, a month, or custom dates). Reads Home
// Assistant's long-term statistics and draws the charts itself. Self-contained: serialised with toString.
function dwellEnergyHistory(card, hass, cfg) {
  const all = window.__dwellHist = window.__dwellHist || {};
  const store = (() => { try { return window.localStorage; } catch (e) { return null; } })();
  const st = all[cfg.key] = all[cfg.key] || {range: store?.getItem('dwelldeck-energy-range') || '30d', from: '', to: '', data: null, loading: false, asked: ''};
  const RANGES = [['today', 'Today'], ['yesterday', 'Yesterday'], ['2d', 'Last 2 days'], ['3d', 'Last 3 days'], ['7d', 'Last week'], ['14d', 'Last 2 weeks'],
    ['21d', 'Last 3 weeks'], ['30d', 'Last month'], ['custom', 'Custom dates']];
  const day0 = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const span = () => {
    const now = new Date(), today = day0(now);
    if (st.range === 'today') return [today, now];
    if (st.range === 'yesterday') return [new Date(today.getTime() - 86400000), today];
    if (st.range === 'custom' && st.from && st.to) {
      const from = day0(st.from + 'T00:00'), to = new Date(day0(st.to + 'T00:00').getTime() + 86400000);
      return to > from ? [from, to < now ? to : now] : [from, new Date(from.getTime() + 86400000)];
    }
    const days = Number.parseInt(st.range, 10) || 30;
    return [new Date(today.getTime() - (days - 1) * 86400000), now];
  };
  const draw = () => {
    const target = card?.shadowRoot?.querySelector(`.eh[data-key="${cfg.key}"]`);
    if (target) target.outerHTML = render();
  };
  const load = async () => {
    const [from, to] = span();
    const period = to - from <= 3 * 86400000 + 1000 ? 'hour' : 'day';
    const asked = `${st.range}|${st.from}|${st.to}|${from.toDateString()}|${Math.floor(Date.now() / 300000)}`;
    if (st.loading || st.asked === asked) return;
    Object.assign(st, {loading: true, asked});
    const ids = [...new Set([...Object.values(cfg.totals).flat(), ...cfg.power.solar, ...cfg.power.home, ...cfg.soc])];
    try {
      const stats = await hass.callWS({type: 'recorder/statistics_during_period', start_time: from.toISOString(), end_time: to.toISOString(),
        statistic_ids: ids, period, types: ['change', 'mean', 'min', 'max'], units: {energy: 'kWh', power: 'W'}});
      const starts = [...new Set(Object.values(stats).flat().map(row => typeof row.start === 'number' ? row.start : Date.parse(row.start)))].sort((a, b) => a - b);
      const pick = (id, type) => starts.map(t => {
        const v = (stats[id] || []).find(row => (typeof row.start === 'number' ? row.start : Date.parse(row.start)) === t)?.[type];
        return Number.isFinite(v) ? v : null;
      });
      // Each field is added up, averaged, or drawn one line per sensor, as chosen in DwellDeck setup.
      const combine = (list, type, mode, label) => {
        if (!list.length) return [];
        const cols = list.map(id => pick(id, type));
        if (mode === 'each' && list.length > 1) return list.map((id, k) => ({name: label + ' · ' + (cfg.names[id] || id), values: cols[k], shade: k}));
        return [{name: label, shade: 0, values: starts.map((_, i) => {
          const v = cols.map(col => col[i]).filter(x => x !== null);
          return v.length ? (mode === 'average' ? v.reduce((a, b) => a + b, 0) / v.length : v.reduce((a, b) => a + b, 0)) : null;
        })}];
      };
      const m = cfg.modes;
      st.data = {period, starts, error: '',
        solarE: combine(cfg.totals.solar, 'change', m.energy, 'Solar'), homeE: combine(cfg.totals.home, 'change', m.energy, 'Home'),
        charge: combine(cfg.totals.charge, 'change', m.energy, 'Charged'), discharge: combine(cfg.totals.discharge, 'change', m.energy, 'Discharged'),
        import: combine(cfg.totals.import, 'change', m.energy, 'From grid'), export: combine(cfg.totals.export, 'change', m.energy, 'To grid'),
        solarW: combine(cfg.power.solar, 'mean', m.solar, 'Solar'), homeW: combine(cfg.power.home, 'mean', m.home, 'Home'),
        soc: combine(cfg.soc, 'mean', m.soc, 'Battery'),
        socMin: m.soc === 'each' ? [] : combine(cfg.soc, 'min', 'average', 'Battery'), socMax: m.soc === 'each' ? [] : combine(cfg.soc, 'max', 'average', 'Battery')};
    } catch (e) {
      st.data = {error: 'Could not read the history: ' + (e?.message || e?.code || 'unknown error')};
    }
    st.loading = false;
    draw();
  };
  window.__dwellHistUi = window.__dwellHistUi || {
    pick(el) {
      const box = el.closest('.eh'); const s = window.__dwellHist[box.dataset.key];
      s.range = el.value; try { window.localStorage.setItem('dwelldeck-energy-range', el.value); } catch (e) { /* private mode */ }
      box.querySelector('.custom').hidden = el.value !== 'custom';
      if (el.value !== 'custom') { s.asked = ''; window.__dwellHistLoad[box.dataset.key]?.(); }
    },
    // The large view goes on the page itself, so no card around it can clip it.
    open(el) {
      const key = el.closest('.eh').dataset.key;
      document.querySelectorAll('body > .dwh').forEach(old => old.remove());
      const root = document.createElement('div');
      root.className = 'dwh';
      root.innerHTML = window.__dwellHistBig[key](el.dataset.chart);
      document.body.appendChild(root);
      const close = root.querySelector('.x'); close?.focus();
      root.addEventListener('keydown', event => { if (event.key === 'Escape') window.__dwellHistUi.close(close); });
    },
    close(el) { el?.closest('.dwh')?.remove(); },
    apply(el) {
      const box = el.closest('.eh'); const s = window.__dwellHist[box.dataset.key];
      s.from = box.querySelector('.from').value; s.to = box.querySelector('.to').value || s.from;
      if (!s.from) return;
      s.asked = ''; window.__dwellHistLoad[box.dataset.key]?.();
    }
  };
  window.__dwellHistLoad = window.__dwellHistLoad || {};
  window.__dwellHistLoad[cfg.key] = load;

  const esc = v => String(v).replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
  const fmtTime = t => {
    const d = new Date(t);
    return st.data.period === 'hour' ? d.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) : d.toLocaleDateString([], {day: 'numeric', month: 'short'});
  };
  const fmtFull = t => {
    const d = new Date(t);
    return d.toLocaleDateString([], {weekday: 'short', day: 'numeric', month: 'short'}) + (st.data.period === 'hour' ? ', ' + d.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) : '');
  };
  const total = values => values.reduce((a, v) => a + (v || 0), 0);
  // One colour per kind; several sensors of one kind get lighter shades (bars) or dashes (lines).
  const paint = (list, color) => list.map(item => ({...item, color}));
  const fade = item => Math.max(0.35, 1 - (item.shade || 0) * 0.3);
  const num = (v, unit) => v === null || v === undefined ? '—' : (unit === '%' || Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(1)) + ' ' + unit;
  const legend = items => `<div class="lg">${items.map(([name, color, extra, shade]) => `<span><i style="background:${color};opacity:${Math.max(0.35, 1 - (shade || 0) * 0.3)}"></i>${esc(name)}${extra ? ` <b>${extra}</b>` : ''}</span>`).join('')}</div>`;
  // The charts of the picked range, kept so a chart can be opened large.
  const specs = d => {
    const per = d.period === 'hour' ? 'per hour' : 'per day';
    return [
      {id: 'energy', kind: 'bar', unit: 'kWh', title: `Solar and home, kWh ${per}`, list: [...paint(d.solarE, '#f2c14e'), ...paint(d.homeE, '#b9a3e3')]},
      {id: 'flows', kind: 'bar', unit: 'kWh', title: `Battery and grid, kWh ${per}`, list: [...paint(d.charge, '#a8c49a'), ...paint(d.discharge, '#6f9a6a'), ...paint(d.import, '#8fb8d0'), ...paint(d.export, '#5d8aa6')]},
      {id: 'power', kind: 'line', unit: 'W', title: `Solar and home power (W), average ${per}`, list: [...paint(d.solarW, '#f2c14e'), ...paint(d.homeW, '#b9a3e3')]},
      {id: 'soc', kind: 'line', unit: '%', title: 'Battery level, %', fixed: [0, 100],
        list: [...(d.socMax[0] ? [{name: 'Low to high', color: '#a8c49a', values: d.socMax[0].values, band: d.socMin[0].values}] : []), ...paint(d.soc, '#a8c49a')]}
    ].map(spec => ({...spec, list: spec.list.filter(item => item.values.some(v => v !== null && (spec.kind === 'line' || v)))})).filter(spec => spec.list.some(item => !item.band));
  };
  // Draws one chart. Negative values (export, discharge) go below a zero line; the scale covers all of it.
  // Hovering a time shows every value at that time.
  const chart = (spec, W, H) => {
    const L = 44, B = 22, T = 10, R = 6;
    const starts = st.data.starts, n = starts.length;
    const values = spec.list.flatMap(item => [...item.values, ...(item.band || [])]).filter(v => v !== null);
    let lo = spec.fixed ? spec.fixed[0] : Math.min(0, ...values), hi = spec.fixed ? spec.fixed[1] : Math.max(0, ...values);
    if (!spec.fixed) { const pad = (hi - lo || 1) * 0.08; hi = hi > 0 ? hi + pad : hi; lo = lo < 0 ? lo - pad : lo; if (hi === lo) hi = lo + 1; }
    const y = v => T + (H - T - B) * (hi - v) / (hi - lo);
    const slot = (W - L - R) / n, cx = i => L + (i + 0.5) * slot;
    const ticks = [...new Set([lo, hi, ...(lo < 0 && hi > 0 ? [0] : [(lo + hi) / 2])])].sort((a, b) => a - b);
    const grid = ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="${cfg.c.line}"${v === 0 && lo < 0 ? ' stroke-width="1.5"' : ''}/><text x="${L - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${num(v, '').trim()}</text>`).join('');
    const step = Math.max(1, Math.ceil(n / Math.max(4, Math.floor(W / 90))));
    const xl = starts.map((t, i) => i % step ? '' : `<text x="${cx(i).toFixed(1)}" y="${H - 6}" text-anchor="middle">${fmtTime(t)}</text>`).join('');
    const marks = spec.kind === 'bar'
      ? spec.list.map((item, k) => item.values.map((v, i) => {
          if (!v) return '';
          const bw = Math.max(1, slot * 0.8 / spec.list.length), x = L + i * slot + slot * 0.1 + k * bw, top = Math.min(y(v), y(0)), h = Math.abs(y(v) - y(0));
          return `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.5, h).toFixed(1)}" rx="1.5" fill="${item.color}" fill-opacity="${fade(item)}"/>`;
        }).join('')).join('')
      : spec.list.map(item => {
          const pts = (vals) => vals.map((v, i) => v === null ? null : `${cx(i).toFixed(1)},${y(v).toFixed(1)}`);
          if (item.band) return `<polygon points="${[...pts(item.values), ...pts(item.band).reverse()].filter(Boolean).join(' ')}" fill="${item.color}" fill-opacity=".16"/>`;
          return `<polyline points="${pts(item.values).filter(Boolean).join(' ')}" fill="none" stroke="${item.color}" stroke-opacity="${fade(item)}" stroke-width="2" stroke-linejoin="round"${item.shade ? ` stroke-dasharray="${item.shade === 1 ? '6 4' : '2 3'}"` : ''}/>`;
        }).join('');
    // Hover: a column per time with a line, dots and a box listing the values.
    const shown = spec.list.filter(item => !item.band);
    const hover = starts.map((t, i) => {
      const rows = [fmtFull(t), ...shown.map(item => `${item.name}: ${num(item.values[i], spec.unit)}`)];
      if (spec.list.some(item => item.band)) rows.push(`Low to high: ${num(spec.list.find(item => item.band).band[i], '%')} – ${num(spec.list.find(item => item.band).values[i], '%')}`);
      const bw = Math.max(...rows.map(r => r.length)) * 6.4 + 16, bh = rows.length * 15 + 10;
      const bx = cx(i) + 10 + bw > W ? cx(i) - 10 - bw : cx(i) + 10;
      const dots = spec.kind === 'line' ? shown.map(item => item.values[i] === null ? '' : `<circle cx="${cx(i).toFixed(1)}" cy="${y(item.values[i]).toFixed(1)}" r="3.5" fill="${item.color}"/>`).join('') : '';
      return `<g class="hv"><rect class="hit" x="${(L + i * slot).toFixed(1)}" y="${T}" width="${slot.toFixed(1)}" height="${H - T - B}"/>
        <g class="tip"><line x1="${cx(i).toFixed(1)}" x2="${cx(i).toFixed(1)}" y1="${T}" y2="${H - B}" stroke="${cfg.c.muted}" stroke-dasharray="3 3"/>${dots}
        <rect x="${bx.toFixed(1)}" y="${T + 2}" width="${bw.toFixed(1)}" height="${bh}" rx="6" fill="#0d141c" stroke="${cfg.c.line}"/>
        ${rows.map((r, j) => `<text class="${j ? 'tv' : 'th'}" x="${(bx + 8).toFixed(1)}" y="${T + 18 + j * 15}">${esc(r)}</text>`).join('')}</g></g>`;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}">${grid}${marks}${xl}${hover}</svg>`;
  };
  const small = spec => `<div class="ch" role="button" tabindex="0" data-chart="${spec.id}" onclick="event.stopPropagation();window.__dwellHistUi.open(this)" onkeydown="if(event.key==='Enter')window.__dwellHistUi.open(this)">
    <div class="tt">${spec.title}<span class="zoom">Open</span></div>${legend(spec.list.filter(item => !item.band).map(item => [item.name, item.color, spec.unit === 'kWh' ? num(total(item.values), 'kWh') : '', item.shade]))}${chart(spec, 600, 180)}</div>`;
  // The large view: the chart, a summary per line, every value in a table, and a CSV download.
  const big = id => {
    const spec = specs(st.data).find(item => item.id === id);
    if (!spec) return '';
    const shown = spec.list.filter(item => !item.band);
    const stats = shown.map(item => {
      const v = item.values.filter(x => x !== null);
      const avg = v.length ? total(v) / v.length : null;
      return `<tr><td><i style="background:${item.color};opacity:${fade(item)}"></i>${esc(item.name)}</td>${spec.unit === 'kWh' ? `<td>${num(total(v), 'kWh')}</td>` : ''}<td>${num(avg, spec.unit)}</td><td>${num(v.length ? Math.min(...v) : null, spec.unit)}</td><td>${num(v.length ? Math.max(...v) : null, spec.unit)}</td></tr>`;
    }).join('');
    const rows = st.data.starts.map((t, i) => `<tr><td>${fmtFull(t)}</td>${shown.map(item => `<td>${num(item.values[i], spec.unit)}</td>`).join('')}</tr>`).reverse().join('');
    const csv = ['Time,' + shown.map(item => `"${item.name}"`).join(','), ...st.data.starts.map((t, i) => [new Date(t).toISOString(), ...shown.map(item => item.values[i] ?? '')].join(','))].join('\n');
    return `${bigStyle}<div class="ov" onclick="if(event.target===this)window.__dwellHistUi.close(this)"><div class="pn" role="dialog" aria-modal="true" aria-label="${esc(spec.title)}">
      <div class="ph"><div class="pt">${spec.title}<div class="ps">${esc(RANGES.find(r => r[0] === st.range)?.[1] || '')}</div></div>
        <a class="dl" download="dwelldeck-${spec.id}.csv" href="data:text/csv;charset=utf-8,${encodeURIComponent(csv)}">Download CSV</a>
        <button class="x" aria-label="Close" onclick="event.stopPropagation();window.__dwellHistUi.close(this)">✕</button></div>
      ${legend(shown.map(item => [item.name, item.color, '', item.shade]))}
      <div class="bigc">${chart(spec, 1000, 340)}</div>
      <table class="sum"><tr><th></th>${spec.unit === 'kWh' ? '<th>Total</th>' : ''}<th>Average</th><th>Lowest</th><th>Highest</th></tr>${stats}</table>
      <div class="tw"><table class="dt"><tr><th>Time</th>${shown.map(item => `<th>${esc(item.name)}</th>`).join('')}</tr>${rows}</table></div>
    </div></div>`;
  };
  const bigStyle = `<style>
    .dwh{font-family:'Atkinson Hyperlegible Next','Atkinson Hyperlegible',Roboto,system-ui,sans-serif}
.dwh .ov{position:fixed;inset:0;z-index:9999;background:rgba(3,8,16,.78);display:grid;place-items:center;padding:16px;cursor:default}
.dwh .pn{width:min(1100px,100%);max-height:calc(100vh - 32px);overflow:auto;box-sizing:border-box;padding:18px;border-radius:20px;background:#141c26;border:1px solid ${cfg.c.line};display:grid;gap:12px}
.dwh .ph{display:flex;align-items:flex-start;gap:12px}
.dwh .pt{flex:1;font-size:18px;font-weight:600;color:${cfg.c.text}}
.dwh .ps{font-size:13px;font-weight:400;color:${cfg.c.muted};margin-top:2px}
.dwh .dl{font-size:14px;color:${cfg.c.onText};text-decoration:none;border:1px solid ${cfg.c.on};border-radius:10px;padding:8px 12px}
.dwh .x{all:unset;cursor:pointer;width:36px;height:36px;display:grid;place-items:center;border-radius:10px;color:${cfg.c.text};background:rgba(255,255,255,.06)}
.dwh .x:focus-visible,.dwh .dl:focus-visible{outline:2px solid ${cfg.c.onText};outline-offset:2px}
.dwh .bigc svg{display:block;width:100%;height:auto}
.dwh .bigc text{font-size:12px;fill:${cfg.c.muted};font-family:inherit}
.dwh .sum,.dwh .dt{width:100%;border-collapse:collapse;font-size:13.5px;color:${cfg.c.text};font-variant-numeric:tabular-nums}
.dwh .sum th,.dwh .dt th{text-align:left;font-weight:600;color:${cfg.c.muted};padding:6px 8px;border-bottom:1px solid ${cfg.c.line};position:sticky;top:0;background:#141c26}
.dwh .sum td,.dwh .dt td{padding:6px 8px;border-bottom:1px solid ${cfg.c.line}}
.dwh .sum i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:8px}
.dwh .tw{max-height:280px;overflow:auto;border-radius:12px;background:rgba(0,0,0,.18)}

    .dwh .hv .hit{fill:transparent}
    .dwh .hv .tip{display:none;pointer-events:none}
    .dwh .hv:hover .tip{display:inline}
    .dwh .hv:hover .hit{fill:rgba(255,255,255,.04)}
    .dwh svg .th{font-size:12.5px;font-weight:600;fill:${cfg.c.text}}
    .dwh svg .tv{font-size:12.5px;fill:${cfg.c.text}}
    .dwh .lg{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:13px;color:${cfg.c.muted}}
    .dwh .lg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px}
  </style>`;
  window.__dwellHistBig = window.__dwellHistBig || {};
  window.__dwellHistBig[cfg.key] = big;
  const render = () => {
    const d = st.data;
    const charts = !d ? `<div class="msg">Loading history…</div>` : d.error ? `<div class="msg">${esc(d.error)}</div>` : !d.starts.length ? `<div class="msg">No history for these dates.</div>`
      : specs(d).map(small).join('') || `<div class="msg">No energy history yet.</div>`;
    return `<div class="eh" data-key="${cfg.key}">
      <div class="bar"><select class="rg" aria-label="Dates" onchange="event.stopPropagation();window.__dwellHistUi.pick(this)">${RANGES.map(([v, label]) => `<option value="${v}"${v === st.range ? ' selected' : ''}>${label}</option>`).join('')}</select>
        <span class="custom"${st.range === 'custom' ? '' : ' hidden'}><input class="from" type="date" value="${st.from}" aria-label="From"><span class="to-word">to</span><input class="to" type="date" value="${st.to}" aria-label="To">
        <button class="ok" onclick="event.stopPropagation();window.__dwellHistUi.apply(this)">Show</button></span>
        ${st.loading && d ? '<span class="busy">Updating…</span>' : ''}</div>
      <div class="charts">${charts}</div></div>`;
  };
  const style = `<style>
    .eh{display:grid;gap:12px;text-align:left}
    .bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
    .rg,.from,.to{font:inherit;font-size:14px;color:${cfg.c.text};background:#101820;border:1px solid ${cfg.c.line};border-radius:10px;height:38px;padding:0 10px;color-scheme:dark}
    .custom{display:inline-flex;flex-wrap:wrap;align-items:center;gap:8px}
    .custom[hidden]{display:none}
    .to-word,.busy{font-size:13px;color:${cfg.c.muted}}
    .ok{all:unset;cursor:pointer;height:38px;padding:0 14px;border-radius:10px;background:rgba(213,167,76,.14);border:1px solid ${cfg.c.on};color:${cfg.c.onText};font-weight:600;font-size:14px;box-sizing:border-box;display:inline-flex;align-items:center}
    .rg:focus-visible,.from:focus-visible,.to:focus-visible,.ok:focus-visible{outline:2px solid ${cfg.c.onText};outline-offset:2px}
    .charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px}
    .ch{padding:12px;border-radius:14px;background:rgba(0,0,0,.18);min-width:0}
    .tt{font-size:15px;font-weight:600;color:${cfg.c.text}}
    .lg{display:flex;flex-wrap:wrap;gap:4px 14px;margin:6px 0 4px;font-size:12.5px;color:${cfg.c.muted}}
    .lg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px}
    .lg b{color:${cfg.c.text};font-weight:600}
    .ch svg{display:block;width:100%;height:auto}
    .ch text{font-size:11px;fill:${cfg.c.muted};font-family:inherit}
    .msg{padding:24px;text-align:center;color:${cfg.c.muted};font-size:14px;grid-column:1/-1}
    .ch{cursor:pointer}
    .ch:hover{background:rgba(0,0,0,.26)}
    .ch:focus-visible{outline:2px solid ${cfg.c.onText};outline-offset:2px}
    .zoom{float:right;font-size:12px;font-weight:500;color:${cfg.c.muted}}
    .hv .hit{fill:transparent}
    .hv .tip{display:none;pointer-events:none}
    .hv:hover .tip{display:inline}
    .hv:hover .hit{fill:rgba(255,255,255,.04)}
    svg .th{font-size:11.5px;font-weight:600;fill:${cfg.c.text}}
    svg .tv{font-size:11.5px;fill:${cfg.c.text}}
  </style>`;
  // Load when shown, and again every five minutes or when the day changes.
  if (hass?.callWS) setTimeout(() => load(), 0);
  return style + render();
}

function historyCard(setup) {
  const cfg = {key: 'energy', totals: setup.total, power: {solar: setup.solar, home: setup.home}, soc: setup.soc, modes: setup.modes, names: setup.names,
    c: {text: EN_C.text, muted: EN_C.muted, line: EN_C.line, on: EN_C.on, onText: EN_C.onText}};
  return {
    type: 'custom:button-card', show_name: false, show_icon: false, show_state: false, show_label: false,
    tap_action: {action: 'none'}, hold_action: {action: 'none'}, variables: {dwell_static: true},
    custom_fields: {history: `[[[ return (${dwellEnergyHistory.toString()})(this, hass, ${JSON.stringify(cfg)}); ]]]`},
    styles: {
      card: [{padding: '16px'}, {'border-radius': '20px'}, {background: `linear-gradient(135deg,${EN_C.surface},${EN_C.card})`}, {border: `1px solid ${EN_C.line}`}, {'box-shadow': 'none'}, {cursor: 'default'}],
      grid: [{'grid-template-areas': '"history"'}, {'grid-template-columns': '1fr'}],
      custom_fields: {history: [{width: '100%'}, {'min-width': '0'}, {'pointer-events': 'auto'}]}
    },
    grid_options: {columns: 'full', rows: 'auto'}
  };
}

export function designEnergy(output, {config = {}, hass = {}}) {
  const view = output.views.find(item => item.path === 'energy');
  if (!view?.sections?.length) return output;
  const graphs = view.sections.flatMap(section => section.cards || []).filter(card => card.type === 'custom:mini-graph-card');
  const slotOf = name => graphs.flatMap(card => card.entities || []).find(row => row.name?.toLowerCase().includes(name))?.entity;
  const setup = energySetup(config, hass, {solar: slotOf('solar'), home: slotOf('load'), soc: slotOf('battery')});
  const watched = [...new Set([...setup.solar, ...setup.home, ...setup.battery, ...setup.grid, ...setup.soc])];
  const todayIds = [...new Set(Object.values(setup.today).flat())];
  const c = {text: EN_C.text, muted: EN_C.muted, line: EN_C.line, on: EN_C.on, onText: EN_C.onText};
  const flow = panel('flow', dwellEnergyFlow, {...setup, today: undefined, total: undefined, names: undefined, height: ENERGY_TOP - 32, c}, watched, ENERGY_TOP);
  const today = panel('today', dwellEnergyToday, {today: setup.today, mode: setup.modes.energy, c}, todayIds, ENERGY_TOP);

  // History with a date picker when there are sensors with statistics; otherwise the page's own graphs, at 30 days.
  const hasHistory = Object.values(setup.total).some(list => list.length) || setup.solar.length || setup.home.length || setup.soc.length;
  const history = hasHistory ? [historyCard(setup)] : graphs.map(card => ({...card, hours_to_show: 720, points_per_hour: 0.25,
    name: String(card.name || '').replace(/ · 24h$/, '').replace(/ now$/, '') + ' · 30 days', grid_options: {columns: 18, rows: 'auto'}}));

  const section = (items, span) => ({type: 'grid', ...(span ? {column_span: span} : {}), cards: items});
  const sections = [
    section([enHeading('Power flow', 'mdi:transit-connection-variant'), flow], 2),
    section([enHeading('Today', 'mdi:calendar-today'), today]),
    // One full-width section: charts two across on a wide screen, one per row on a phone.
    section([enHeading('History', 'mdi:chart-bar'), ...history], 3)
  ];
  view.max_columns = 3;
  view.sections = sections.filter(item => item.cards.length > 1);
  return output;
}
