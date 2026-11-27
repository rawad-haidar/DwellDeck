// Generator card for the Energy page, laid out like DSE's own controller page: the states on the
// left, the front-panel buttons below. Built when generator sensors are found (named gen_…, as a
// DSE controller on Modbus usually is) or set under `generator:` in the strategy config.
//
//   generator:
//     name: DSE 6110 MKIII
//     mode: sensor.gen_control_mode        # DSE control mode register (0 Stop, 1 Auto, 2 Manual, …)
//     rpm / frequency / voltage / power / coolant / oil / fuel / battery / mains: sensor ids
//     scripts: {auto, manual, stop, start, mute, reset, on_load, off_load}: script ids
import {ROOM_COLORS} from './rooms.mjs';
import {touchSafe} from './util.mjs';

const GEN_C = ROOM_COLORS;
const GEN_PREFIX = '(?:gen|generator|genset|dse)';
// DSE GenComm control mode values.
export const DSE_MODES = {0: 'Stop', 1: 'Auto', 2: 'Manual', 3: 'Test on load', 4: 'Auto, manual restore', 5: 'User mode', 6: 'Test off load'};
export const GENSET_BUTTONS = [
  ['auto', 'Auto', 'mdi:autorenew', 'Auto'],
  ['manual', 'Manual', 'mdi:hand-back-right-outline', 'Manual'],
  ['mute', 'Mute alarm', 'mdi:volume-off', null],
  ['off_load', 'To mains', 'mdi:transmission-tower', null],
  ['start', 'Start', 'mdi:power', null],
  ['stop', 'Stop', 'mdi:stop', 'Stop'],
  ['on_load', 'On load', 'mdi:engine', null],
  ['reset', 'Reset alarms', 'mdi:alarm-light-off-outline', null]
];
// Buttons that start, stop or move the load ask first.
const GEN_CONFIRM = {
  auto: 'Put the generator in Auto mode?', manual: 'Put the generator in Manual mode?',
  stop: 'Stop the generator (Stop mode)?', start: 'Start the generator? It must be in Manual mode.',
  on_load: 'Transfer the load to the generator?', off_load: 'Transfer the load back to mains?', reset: 'Reset the generator alarms?'
};

export function gensetSetup(config = {}, hass = {}) {
  const states = hass.states || {};
  const own = config.generator || {};
  const ids = Object.keys(states);
  const find = pattern => ids.find(id => pattern.test(id)) || null;
  const sensor = tail => find(new RegExp(`^sensor\\.${GEN_PREFIX}_(?:.*_)?${tail}$`));
  const script = name => find(new RegExp(`^script\\.${GEN_PREFIX}_${name}$`));
  const setup = {
    name: own.name || 'Generator',
    mode: own.mode ?? sensor('control_mode'),
    rpm: own.rpm ?? sensor('(?:engine_speed|rpm)'),
    frequency: own.frequency ?? sensor('frequency'),
    voltage: own.voltage ?? sensor('(?:l1_n_voltage|l1_voltage|output_voltage)'),
    power: own.power ?? find(/^sensor\.(?:electric_)?generator_(?:.*_)?power$/),
    coolant: own.coolant ?? sensor('coolant_temp(?:erature)?'),
    oil: own.oil ?? sensor('oil_pressure'),
    fuel: own.fuel ?? sensor('fuel_level'),
    battery: own.battery ?? sensor('battery_voltage'),
    // The mains the controller watches isn't always the inverter's grid input, so it is only set by hand.
    mains: own.mains ?? sensor('mains_(?:l1_)?(?:n_)?voltage'),
    scripts: {
      auto: own.scripts?.auto ?? script('auto(?:_mode)?'), manual: own.scripts?.manual ?? script('manual(?:_mode)?'),
      stop: own.scripts?.stop ?? script('stop(?:_mode)?'), start: own.scripts?.start ?? script('start'),
      mute: own.scripts?.mute ?? script('mute(?:_alarms?)?'), reset: own.scripts?.reset ?? script('reset(?:_alarms?)?'),
      on_load: own.scripts?.on_load ?? script('on_load'), off_load: own.scripts?.off_load ?? script('off_load')
    }
  };
  // Only a generator that reports its mode or engine speed gets a card.
  return setup.mode || setup.rpm ? setup : null;
}

// The live panel, drawn in the browser from live states (button-card custom field): what the engine
// is doing and every reading the controller gives, as tiles.
export function dwellGenset(states, cfg) {
  const num = id => { const v = Number(states[id]?.state); return id && Number.isFinite(v) ? v : null; };
  const rpm = num(cfg.rpm), hz = num(cfg.frequency), volts = num(cfg.voltage), power = num(cfg.power), mains = num(cfg.mains);
  const modeValue = num(cfg.mode);
  const mode = modeValue === null ? (states[cfg.mode]?.state || '—') : (cfg.modes[modeValue] || `Mode ${modeValue}`);
  const running = (rpm !== null && rpm > 100) || (hz !== null && hz > 5);
  const loaded = power !== null && power > 50;
  const kw = w => w >= 1000 ? (w / 1000).toFixed(w >= 10000 ? 0 : 1) + ' kW' : Math.round(w) + ' W';
  const status = running ? (loaded ? 'Running on load' : 'Running off load') : 'Engine at rest';
  const chip = (text, on) => `<span style="padding:4px 11px;border-radius:999px;font-size:12.5px;font-weight:600;border:1px solid ${on ? cfg.c.onText : cfg.c.line};color:${on ? cfg.c.onText : cfg.c.muted};background:${on ? cfg.c.on : 'transparent'}">${text}</span>`;
  const chips = [chip(status, running), chip(`Mode · ${mode}`, false)];
  if (mains !== null) chips.push(chip(mains > 150 ? `Mains OK · ${Math.round(mains)} V` : 'Mains off', false));
  // Sensors reporting -1 aren't fitted on this generator: no tile for them.
  const tiles = [
    ['mdi:flash', 'Load', power === null ? null : power, v => kw(v), loaded],
    ['mdi:speedometer', 'Engine speed', rpm, v => `${Math.round(v)} rpm`, running],
    ['mdi:sine-wave', 'Output', volts, v => `${Math.round(v)} V`, running],
    ['mdi:current-ac', 'Frequency', hz, v => `${v.toFixed(1)} Hz`, running],
    ['mdi:thermometer', 'Coolant', num(cfg.coolant), v => `${Math.round(v)} °C`, false],
    ['mdi:car-battery', 'Battery', num(cfg.battery), v => `${v.toFixed(1)} V`, false],
    ['mdi:oil', 'Oil pressure', num(cfg.oil), v => `${Math.round(v)} kPa`, false],
    ['mdi:gas-station', 'Fuel', num(cfg.fuel), v => `${Math.round(v)} %`, false]
  ].filter(([, , v]) => v !== null && v >= 0);
  const tile = ([icon, label, value, show, on]) => `<div style="padding:12px 14px;border-radius:16px;border:1px solid ${on ? cfg.c.onText : cfg.c.line};background:${on ? cfg.c.on : 'rgba(0,0,0,.16)'};min-width:0">
    <div style="display:flex;align-items:center;gap:6px;color:${cfg.c.muted};font-size:12.5px"><ha-icon icon="${icon}" style="--mdc-icon-size:16px"></ha-icon>${label}</div>
    <div style="margin-top:6px;font-size:21px;font-weight:800;color:${on ? cfg.c.onText : cfg.c.text};white-space:nowrap">${show(value)}</div></div>`;
  return `<div style="display:flex;align-items:center;gap:14px;text-align:left;flex-wrap:wrap">
      <div style="display:grid;place-items:center;width:58px;height:58px;border-radius:18px;background:${running ? cfg.c.on : 'rgba(0,0,0,.22)'};border:1px solid ${running ? cfg.c.onText : cfg.c.line}">
        <ha-icon icon="mdi:engine" style="--mdc-icon-size:32px;color:${running ? cfg.c.onText : cfg.c.muted}"></ha-icon></div>
      <div style="flex:1;min-width:180px"><div style="font-size:20px;font-weight:800;color:${cfg.c.text}">${cfg.name}</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">${chips.join('')}</div></div></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-top:16px">${tiles.map(tile).join('')}</div>`;
}

// Generator history, read from the recorder: runs are the stretches with the engine turning (or
// output frequency); energy is the load integrated over time. No energy or hour counter is needed.
export function dwellGensetHistory(card, hass, cfg) {
  const all = window.__dwellGenHist = window.__dwellGenHist || {};
  const store = (() => { try { return window.localStorage; } catch (e) { return null; } })();
  const st = all.g = all.g || {range: store?.getItem('dwelldeck-generator-range') || 'today', data: null, loading: false, asked: ''};
  const RANGES = [['today', 'Today'], ['yesterday', 'Yesterday'], ['24h', 'Last 24 hours'], ['3d', 'Last 3 days'], ['7d', 'Last week'], ['10d', 'Last 10 days']];
  const day0 = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const span = () => {
    const now = new Date(), today = day0(now);
    if (st.range === 'today') return [today, now];
    if (st.range === 'yesterday') return [new Date(today - 86400000), today];
    if (st.range === '24h') return [new Date(now - 86400000), now];
    const days = Number.parseInt(st.range, 10) || 1;
    return [new Date(today - (days - 1) * 86400000), now];
  };
  const ids = [cfg.rpm, cfg.frequency, cfg.power, cfg.coolant, cfg.voltage].filter(Boolean);
  const draw = () => { const t = card?.shadowRoot?.querySelector('.gnh'); if (t) t.outerHTML = render(); };
  const load = async () => {
    const [from, to] = span();
    const asked = `${st.range}|${Math.floor(Date.now() / 120000)}`;
    if (st.loading || st.asked === asked) return;
    Object.assign(st, {loading: true, asked});
    try {
      const res = await hass.callWS({type: 'history/history_during_period', start_time: from.toISOString(), end_time: to.toISOString(),
        entity_ids: ids, minimal_response: true, no_attributes: true, significant_changes_only: false});
      const rows = {};
      for (const id of ids) rows[id] = (res[id] || []).map(item => ({
        t: Math.max(+from, item.lu !== undefined ? item.lu * 1000 : item.lc !== undefined ? item.lc * 1000 : Date.parse(item.last_updated || item.last_changed)),
        v: Number(item.s ?? item.state)})).filter(row => Number.isFinite(row.t));
      st.data = {from: +from, to: +to, rows, error: ''};
    } catch (e) {
      st.data = {error: 'Could not read the history: ' + (e?.message || e?.code || 'unknown error')};
    }
    st.loading = false;
    draw();
  };
  // The value a series had at time t (its last reading at or before t).
  const at = (series, t) => { let v = null; for (const row of series || []) { if (row.t > t) break; v = row.v; } return v; };
  const analyse = d => {
    const turning = cfg.rpm ? d.rows[cfg.rpm] : d.rows[cfg.frequency];
    const limit = cfg.rpm ? 100 : 5;
    const runs = [];
    let open = null;
    for (const row of turning || []) {
      const on = Number.isFinite(row.v) && row.v > limit;
      if (on && !open) open = {start: row.t};
      if (!on && open) { open.end = row.t; runs.push(open); open = null; }
    }
    if (open) { open.end = d.to; open.running = true; runs.push(open); }
    const power = d.rows[cfg.power] || [];
    for (const run of runs) {
      // Energy: the load held between readings, added up over the run.
      let wh = 0, peak = 0, sum = 0, n = 0;
      let last = {t: run.start, v: at(power, run.start) || 0};
      for (const row of power.filter(r => r.t > run.start && r.t < run.end).concat([{t: run.end, v: null}])) {
        const w = Number.isFinite(last.v) ? Math.max(0, last.v) : 0;
        wh += w * (row.t - last.t) / 3600000;
        if (row.v !== null && Number.isFinite(row.v)) { peak = Math.max(peak, row.v); sum += row.v; n++; }
        last = row;
      }
      peak = Math.max(peak, at(power, run.start) || 0);
      const coolant = (d.rows[cfg.coolant] || []).filter(r => r.t >= run.start && r.t <= run.end).map(r => r.v).filter(Number.isFinite);
      Object.assign(run, {kwh: wh / 1000, peak, avg: (run.end - run.start) ? wh / ((run.end - run.start) / 3600000) : 0, hot: coolant.length ? Math.max(...coolant) : null});
    }
    return runs;
  };
  const time = t => new Date(t).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
  const date = t => new Date(t).toLocaleDateString([], {weekday: 'short', day: 'numeric', month: 'short'});
  const long = ms => { const m = Math.round(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`; };
  const kw = w => w >= 1000 ? (w / 1000).toFixed(1) + ' kW' : Math.round(w) + ' W';
  const chart = (d, runs) => {
    const W = 760, H = 170, L = 44, R = 10, T = 12, B = 26;
    const x = t => L + (t - d.from) / Math.max(1, d.to - d.from) * (W - L - R);
    const power = (d.rows[cfg.power] || []).filter(r => Number.isFinite(r.v));
    const top = Math.max(1000, ...power.map(r => r.v)) * 1.1;
    const y = v => T + (1 - v / top) * (H - T - B);
    let path = '';
    let prev = null;
    for (const r of power) { const px = x(r.t).toFixed(1); path += prev === null ? `M${px},${y(r.v).toFixed(1)}` : ` L${px},${y(prev).toFixed(1)} L${px},${y(r.v).toFixed(1)}`; prev = r.v; }
    if (prev !== null) path += ` L${x(d.to).toFixed(1)},${y(prev).toFixed(1)}`;
    const shade = runs.map(run => `<rect x="${x(run.start).toFixed(1)}" y="${T}" width="${Math.max(2, x(run.end) - x(run.start)).toFixed(1)}" height="${H - T - B}" fill="${cfg.c.on}" opacity=".55"/>`).join('');
    const ticks = [0, .5, 1].map(f => `<text x="${L - 6}" y="${(y(top / 1.1 * f) + 4).toFixed(1)}" text-anchor="end">${kw(top / 1.1 * f)}</text>`).join('');
    const days = (d.to - d.from) > 36 * 3600000;
    const marks = [0, .25, .5, .75, 1].map(f => { const t = d.from + f * (d.to - d.from); return `<text x="${x(t).toFixed(1)}" y="${H - 6}" text-anchor="middle">${days ? date(t) : time(t)}</text>`; }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Generator load over time">${shade}<line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="${cfg.c.line}"/>
      ${path ? `<path d="${path}" fill="none" stroke="${cfg.c.onText}" stroke-width="2"/>` : ''}${ticks}${marks}</svg>`;
  };
  const render = () => {
    const d = st.data;
    const pick = `<select class="rg" aria-label="Time range">${RANGES.map(([k, label]) => `<option value="${k}"${k === st.range ? ' selected' : ''}>${label}</option>`).join('')}</select>`;
    if (!d || st.loading && !d.rows) return `<div class="gnh">${pick}<div class="msg">Reading the generator history…</div></div>`;
    if (d.error) return `<div class="gnh">${pick}<div class="msg">${d.error}</div></div>`;
    const runs = analyse(d);
    const total = runs.reduce((s, r) => s + (r.end - r.start), 0), kwh = runs.reduce((s, r) => s + r.kwh, 0);
    const stat = (label, value) => `<div class="st"><div class="sl">${label}</div><div class="sv">${value}</div></div>`;
    const rows = runs.slice().reverse().map(run => `<div class="run"><div class="rt"><b>${date(run.start)}</b> · ${time(run.start)} → ${run.running ? '<span class="now">running</span>' : time(run.end)}</div>
      <div class="rm"><span>${long(run.end - run.start)}</span><span>${run.kwh.toFixed(1)} kWh</span><span>avg ${kw(run.avg)}</span><span>peak ${kw(run.peak)}</span>${run.hot !== null ? `<span>max ${Math.round(run.hot)} °C</span>` : ''}</div></div>`).join('');
    return `<div class="gnh">${pick}
      <div class="sts">${stat('Running time', total ? long(total) : '0 min')}${stat('Energy', kwh.toFixed(1) + ' kWh')}${stat('Starts', runs.length)}</div>
      <div class="blk">${chart(d, runs)}</div>
      ${rows ? `<div class="runs">${rows}</div>` : '<div class="msg">The generator didn\'t run in this period.</div>'}</div>`;
  };
  setTimeout(() => {
    const root = card?.shadowRoot;
    if (!root || root.__dwellGen) return;
    root.__dwellGen = true;
    root.addEventListener('change', event => {
      if (!event.target?.classList?.contains('rg')) return;
      st.range = event.target.value;
      try { store?.setItem('dwelldeck-generator-range', st.range); } catch (e) { /* private mode */ }
      st.asked = '';
      load();
    });
  }, 0);
  const style = `<style>
    .gnh{display:grid;gap:14px;text-align:left;color:${cfg.c.text}}
    .rg{justify-self:start;font:inherit;color:${cfg.c.text};background:rgba(0,0,0,.2);border:1px solid ${cfg.c.line};border-radius:10px;padding:7px 10px}
    .sts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
    .st{padding:12px 14px;border-radius:14px;border:1px solid ${cfg.c.line};background:rgba(0,0,0,.16)}
    .sl{font-size:12.5px;color:${cfg.c.muted}}.sv{margin-top:4px;font-size:20px;font-weight:800}
    .blk svg{display:block;width:100%;height:auto}.blk text{font-size:11px;fill:${cfg.c.muted};font-family:inherit}
    .runs{display:grid;gap:8px;max-height:300px;overflow:auto}
    .run{padding:10px 12px;border-radius:12px;border:1px solid ${cfg.c.line}}
    .rt{font-size:13.5px}.now{color:${cfg.c.onText};font-weight:700}
    .rm{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:4px;font-size:12.5px;color:${cfg.c.muted}}
    .msg{padding:20px;text-align:center;color:${cfg.c.muted};font-size:14px}
  </style>`;
  if (hass?.callWS) setTimeout(() => load(), 0);
  return style + render();
}

const gensetButton = (setup, [key, label, icon, mode]) => {
  const script = setup.scripts[key];
  if (!script) return null;
  const tone = key === 'start' ? '#3f9b4f' : key === 'stop' ? '#d24a3c' : null;
  // The current mode's button carries a dot, like the controller's own LED.
  const modeValue = Object.entries(DSE_MODES).find(([, name]) => name === mode)?.[0];
  const dot = mode && setup.mode ? `[[[ return Number(states['${setup.mode}']?.state) === ${modeValue} ? 'block' : 'none' ]]]` : 'none';
  return {
    type: 'custom:button-card', name: label, icon, show_state: false, variables: {dwell_static: true},
    triggers_update: setup.mode ? [setup.mode] : [],
    tap_action: {action: 'perform-action', perform_action: 'script.turn_on', target: {entity_id: script}, ...(GEN_CONFIRM[key] ? {confirmation: {text: GEN_CONFIRM[key]}} : {})},
    hold_action: {action: 'none'},
    custom_fields: {dot: ' '},
    styles: {
      card: [{padding: '10px 4px'}, {background: 'transparent'}, {border: 'none'}, {'box-shadow': 'none'}, {overflow: 'visible'}],
      grid: [{'grid-template-areas': '"i" "n"'}, {'grid-template-rows': '64px auto'}, {'justify-items': 'center'}, {gap: '6px'}],
      img_cell: [{width: '58px'}, {height: '58px'}, {'border-radius': '50%'}, {background: tone || 'rgba(255,255,255,.92)'},
        {border: `2px solid ${tone ? 'rgba(255,255,255,.35)' : GEN_C.line}`}],
      icon: [{width: '28px'}, {color: tone ? '#fff' : '#1b1f24'}],
      name: [{'font-size': '12px'}, {color: GEN_C.muted}, {'white-space': 'normal'}, {'line-height': '1.2'}],
      custom_fields: {dot: [{position: 'absolute'}, {top: '6px'}, {right: 'calc(50% - 34px)'}, {width: '14px'}, {height: '14px'},
        {'border-radius': '50%'}, {background: '#d24a3c'}, {border: '2px solid rgba(255,255,255,.85)'}, {display: dot}]}
    }
  };
};

// The Generator section: the state panel and a row of controller buttons.
export function gensetSection(setup) {
  const watched = [setup.mode, setup.rpm, setup.frequency, setup.voltage, setup.power, setup.coolant, setup.oil, setup.fuel, setup.battery, setup.mains].filter(Boolean);
  const cfg = {...setup, scripts: undefined, modes: DSE_MODES, c: {text: GEN_C.text, muted: GEN_C.muted, line: GEN_C.line, on: GEN_C.on, onText: GEN_C.onText}};
  const panel = {
    type: 'custom:button-card', show_name: false, show_icon: false, show_state: false, show_label: false,
    tap_action: {action: 'none'}, hold_action: {action: 'none'}, triggers_update: watched, variables: {dwell_static: true},
    custom_fields: {genset: touchSafe(`(${dwellGenset.toString()})(states, ${JSON.stringify(cfg)})`)},
    styles: {
      card: [{padding: '18px'}, {'border-radius': '20px'}, {background: `linear-gradient(135deg,${GEN_C.surface},${GEN_C.card})`}, {border: `1px solid ${GEN_C.line}`}, {'box-shadow': 'none'}, {cursor: 'default'}],
      grid: [{'grid-template-areas': '"genset"'}, {'grid-template-columns': '1fr'}],
      custom_fields: {genset: [{width: '100%'}, {'pointer-events': 'auto'}]}
    },
    grid_options: {columns: 'full', rows: 'auto'}
  };
  const buttons = GENSET_BUTTONS.map(item => gensetButton(setup, item)).filter(Boolean);
  const cards = [{type: 'heading', heading: 'Generator', icon: 'mdi:engine', heading_style: 'title'}, panel];
  if (buttons.length) cards.push({type: 'grid', columns: 4, square: false, cards: buttons, grid_options: {columns: 'full'}});
  // History: runs, running time and energy, worked out from the recorder (no counters needed).
  const historyCfg = {rpm: setup.rpm, frequency: setup.frequency, power: setup.power, coolant: setup.coolant, voltage: setup.voltage, c: cfg.c};
  cards.push({type: 'heading', heading: 'Generator history', icon: 'mdi:history', heading_style: 'subtitle'}, {
    type: 'custom:button-card', show_name: false, show_icon: false, show_state: false, show_label: false,
    tap_action: {action: 'none'}, hold_action: {action: 'none'}, variables: {dwell_static: true}, triggers_update: [setup.rpm || setup.frequency].filter(Boolean),
    custom_fields: {history: touchSafe(`(${dwellGensetHistory.toString()})(this, hass, ${JSON.stringify(historyCfg)})`)},
    styles: {
      card: [{padding: '16px'}, {'border-radius': '20px'}, {background: `linear-gradient(135deg,${GEN_C.surface},${GEN_C.card})`}, {border: `1px solid ${GEN_C.line}`}, {'box-shadow': 'none'}, {cursor: 'default'}],
      grid: [{'grid-template-areas': '"history"'}, {'grid-template-columns': '1fr'}],
      custom_fields: {history: [{width: '100%'}, {'pointer-events': 'auto'}]}
    },
    grid_options: {columns: 'full', rows: 'auto'}
  });
  return {type: 'grid', column_span: 3, cards};
}
