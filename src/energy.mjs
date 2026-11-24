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
    return live.length ? live.reduce((total, s) => total + Number(s.state) * (s.attributes?.unit_of_measurement === 'Wh' ? 0.001 : 1), 0) : null;
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
      const series = (list, type) => starts.map(t => {
        const values = list.map(id => (stats[id] || []).find(row => (typeof row.start === 'number' ? row.start : Date.parse(row.start)) === t)?.[type]).filter(v => Number.isFinite(v));
        return values.length ? values.reduce((a, b) => a + b, 0) : null;
      });
      const avg = (list, type) => starts.map(t => {
        const values = list.map(id => (stats[id] || []).find(row => (typeof row.start === 'number' ? row.start : Date.parse(row.start)) === t)?.[type]).filter(v => Number.isFinite(v));
        return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
      });
      st.data = {period, starts, error: '',
        energy: Object.fromEntries(Object.entries(cfg.totals).map(([key, list]) => [key, series(list, 'change')])),
        solarW: series(cfg.power.solar, 'mean'), homeW: series(cfg.power.home, 'mean'),
        soc: avg(cfg.soc, 'mean'), socMin: avg(cfg.soc, 'min'), socMax: avg(cfg.soc, 'max')};
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
  const W = 600, H = 170, L = 40, B = 22, T = 8;
  const axis = (max, unit) => [0, 0.5, 1].map(f => {
    const y = T + (H - T - B) * (1 - f);
    return `<line x1="${L}" x2="${W}" y1="${y}" y2="${y}" stroke="${cfg.c.line}"/><text x="${L - 6}" y="${y + 4}" text-anchor="end">${unit === '%' ? Math.round(max * f) : (max * f >= 10 ? Math.round(max * f) : (max * f).toFixed(1))}</text>`;
  }).join('');
  const xLabels = n => {
    const step = Math.max(1, Math.ceil(n / 8));
    return st.data.starts.map((t, i) => i % step ? '' : `<text x="${L + (i + 0.5) * (W - L) / n}" y="${H - 6}" text-anchor="middle">${fmtTime(t)}</text>`).join('');
  };
  const total = values => values.reduce((a, v) => a + (v || 0), 0);
  const legend = items => `<div class="lg">${items.map(([name, color, extra]) => `<span><i style="background:${color}"></i>${esc(name)}${extra ? ` <b>${extra}</b>` : ''}</span>`).join('')}</div>`;
  const barChart = (title, unit, list) => {
    list = list.filter(item => item.values.some(v => v));
    if (!list.length) return '';
    const n = st.data.starts.length, max = Math.max(0.1, ...list.flatMap(item => item.values.map(v => v || 0))) * 1.1;
    const slot = (W - L) / n, bw = Math.max(1, slot * 0.8 / list.length);
    const bars = list.map((item, k) => item.values.map((v, i) => {
      if (!v) return '';
      const h = (H - T - B) * v / max, x = L + i * slot + slot * 0.1 + k * bw;
      return `<rect x="${x.toFixed(1)}" y="${(H - B - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="${item.color}"><title>${esc(item.name)} · ${fmtTime(st.data.starts[i])}: ${v.toFixed(1)} ${unit}</title></rect>`;
    }).join('')).join('');
    return `<div class="ch"><div class="tt">${title}</div>${legend(list.map(item => [item.name, item.color, total(item.values).toFixed(1) + ' ' + unit]))}
      <svg viewBox="0 0 ${W} ${H}">${axis(max, unit)}${bars}${xLabels(n)}</svg></div>`;
  };
  const lineChart = (title, unit, list, fixedMax) => {
    list = list.filter(item => item.values.some(v => v !== null));
    if (!list.length) return '';
    const n = st.data.starts.length, max = fixedMax || Math.max(1, ...list.flatMap(item => item.values.map(v => v || 0))) * 1.1;
    const pt = (v, i) => `${(L + (i + 0.5) * (W - L) / n).toFixed(1)},${(T + (H - T - B) * (1 - v / max)).toFixed(1)}`;
    const lines = list.map(item => {
      const pts = item.values.map((v, i) => v === null ? null : pt(v, i)).filter(Boolean);
      return item.band ? `<polygon points="${[...item.values.map((v, i) => v === null ? null : pt(v, i)), ...item.band.map((v, i) => v === null ? null : pt(v, i)).reverse()].filter(Boolean).join(' ')}" fill="${item.color}" fill-opacity=".18"/>`
        : `<polyline points="${pts.join(' ')}" fill="none" stroke="${item.color}" stroke-width="2" stroke-linejoin="round"/>`;
    }).join('');
    return `<div class="ch"><div class="tt">${title}</div>${legend(list.filter(item => !item.band).map(item => [item.name, item.color]))}
      <svg viewBox="0 0 ${W} ${H}">${axis(max, unit)}${lines}${xLabels(n)}</svg></div>`;
  };
  const render = () => {
    const d = st.data;
    const per = d?.period === 'hour' ? 'per hour' : 'per day';
    const charts = !d ? `<div class="msg">Loading history…</div>` : d.error ? `<div class="msg">${esc(d.error)}</div>` : !d.starts.length ? `<div class="msg">No history for these dates.</div>` : [
      barChart(`Solar and home, kWh ${per}`, 'kWh', [{name: 'Solar', color: '#f2c14e', values: d.energy.solar}, {name: 'Home', color: '#b9a3e3', values: d.energy.home}]),
      barChart(`Battery and grid, kWh ${per}`, 'kWh', [{name: 'Charged', color: '#a8c49a', values: d.energy.charge}, {name: 'Discharged', color: '#6f9a6a', values: d.energy.discharge},
        {name: 'From grid', color: '#8fb8d0', values: d.energy.import}, {name: 'To grid', color: '#5d8aa6', values: d.energy.export}]),
      lineChart(`Solar and home power (W), average ${per}`, 'W', [{name: 'Solar', color: '#f2c14e', values: d.solarW}, {name: 'Home', color: '#b9a3e3', values: d.homeW}]),
      lineChart('Battery level, %', '%', [{name: 'Low to high', color: '#a8c49a', values: d.socMax, band: d.socMin}, {name: 'Battery', color: '#a8c49a', values: d.soc}], 100)
    ].join('') || `<div class="msg">No energy history yet.</div>`;
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
  </style>`;
  // Load when shown, and again every five minutes or when the day changes.
  if (hass?.callWS) setTimeout(() => load(), 0);
  return style + render();
}

function historyCard(setup) {
  const cfg = {key: 'energy', totals: setup.total, power: {solar: setup.solar, home: setup.home}, soc: setup.soc,
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
  const flow = panel('flow', dwellEnergyFlow, {...setup, today: undefined, total: undefined, height: ENERGY_TOP - 32, c}, watched, ENERGY_TOP);
  const today = panel('today', dwellEnergyToday, {today: setup.today, c}, todayIds, ENERGY_TOP);

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
