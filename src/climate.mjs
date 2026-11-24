// Climate page: what is running first (with one action to turn everything off), the heating system beside it,
// then the air conditioners, floor heating, scenes and history.
import {ROOM_COLORS} from './rooms.mjs';

const CL_C = ROOM_COLORS;
const CLIMATE_TOP = 320;
const clHeading = (text, icon) => ({type: 'heading', heading: text, icon, heading_style: 'title'});

// Runs inside a button-card template: house temperature, what is heating or cooling, and a two-tap
// "turn all off". Self-contained: serialised with toString.
function dwellClimateStatus(states, cfg) {
  const esc = v => String(v).replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
  window.__dwellClimate = window.__dwellClimate || {
    hass: () => document.querySelector('home-assistant')?.hass,
    info(el) { el.dispatchEvent(new CustomEvent('hass-more-info', {detail: {entityId: el.dataset.entity}, bubbles: true, composed: true})); },
    // First tap asks, second tap within four seconds turns everything off.
    off(el) {
      if (el.dataset.armed !== '1') {
        el.dataset.armed = '1'; el.textContent = 'Tap again to turn all off';
        clearTimeout(el._t); el._t = setTimeout(() => { el.dataset.armed = ''; el.textContent = el.dataset.label; }, 4000);
        return;
      }
      clearTimeout(el._t); el.dataset.armed = ''; el.textContent = 'Turning off…';
      const ids = JSON.parse(el.dataset.ids);
      const hass = this.hass();
      Promise.all([
        ids.climate.length ? hass?.callService('climate', 'turn_off', {entity_id: ids.climate}) : null,
        ids.other.length ? hass?.callService('homeassistant', 'turn_off', {entity_id: ids.other}) : null
      ]).finally(() => { el.textContent = el.dataset.label; });
    }
  };
  const running = id => {
    const e = states[id];
    if (!e || ['unavailable', 'unknown'].includes(e.state)) return false;
    if (id.startsWith('climate.')) {
      const a = e.attributes?.hvac_action;
      return a ? !['off', 'idle'].includes(a) : e.state !== 'off';
    }
    return e.state === 'on';
  };
  const on = cfg.climates.filter(id => states[id] && !['off', 'unavailable', 'unknown'].includes(states[id].state));
  const heatOn = cfg.heating.filter(running);
  const temps = cfg.climates.map(id => Number(states[id]?.attributes?.current_temperature)).filter(Number.isFinite);
  const inside = temps.length ? (temps.reduce((a, b) => a + b, 0) / temps.length) : null;
  const w = cfg.weather && states[cfg.weather];
  const outside = Number(w?.attributes?.temperature);
  const unit = states[cfg.climates[0]]?.attributes?.temperature_unit || '°C';
  const name = id => states[id]?.attributes?.friendly_name || id.split('.')[1].replaceAll('_', ' ');
  const mode = e => {
    const a = e.attributes?.hvac_action, m = e.state;
    const word = a === 'cooling' ? 'Cooling' : a === 'heating' ? 'Heating' : a === 'drying' ? 'Drying' : a === 'fan' ? 'Fan' : a === 'idle' ? 'Idle'
      : m === 'cool' ? 'Cool' : m === 'heat' ? 'Heat' : m === 'dry' ? 'Dry' : m === 'fan_only' ? 'Fan' : m === 'heat_cool' || m === 'auto' ? 'Auto' : m;
    const icon = /cool/i.test(word) ? 'mdi:snowflake' : /heat/i.test(word) ? 'mdi:fire' : /dry/i.test(word) ? 'mdi:water-percent' : /fan/i.test(word) ? 'mdi:fan' : 'mdi:thermostat';
    return {word, icon, tone: /heat/i.test(word) ? 'heat' : /cool/i.test(word) ? 'cool' : 'other'};
  };
  const row = id => {
    const e = states[id], m = mode(e), cur = e.attributes?.current_temperature, set = e.attributes?.temperature;
    return `<button class="row" data-entity="${id}" onclick="event.stopPropagation();window.__dwellClimate.info(this)"><ha-icon icon="${m.icon}" class="${m.tone}"></ha-icon>
      <span class="nm">${esc(name(id))}</span><span class="md ${m.tone}">${esc(m.word)}</span><span class="tp">${cur ?? '—'}° <span class="ar">→</span> ${set ?? '—'}°</span></button>`;
  };
  const heatRow = id => `<button class="row" data-entity="${id}" onclick="event.stopPropagation();window.__dwellClimate.info(this)"><ha-icon icon="mdi:fire" class="heat"></ha-icon>
    <span class="nm">${esc(name(id))}</span><span class="md heat">On</span><span class="tp"></span></button>`;
  const ids = {climate: on, other: heatOn.filter(id => !id.startsWith('climate.'))};
  const anything = on.length || heatOn.length;
  const label = 'Turn everything off';
  return `<style>
    .cs{display:grid;gap:16px;text-align:left}
    .top{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:12px 24px}
    .big{font-size:44px;line-height:1;font-weight:600;letter-spacing:-1px;color:${cfg.c.text};font-variant-numeric:tabular-nums}
    .lbl{font-size:14px;color:${cfg.c.muted};margin-bottom:6px}
    .out{font-size:14px;color:${cfg.c.muted};margin-top:6px}
    .sum{display:flex;flex-wrap:wrap;gap:8px}
    .pill{display:flex;align-items:center;gap:8px;height:38px;padding:0 14px;border-radius:999px;font-size:14px;color:${cfg.c.muted};background:rgba(0,0,0,.18);border:1px solid ${cfg.c.line}}
    .pill.on{color:${cfg.c.onText};border-color:${cfg.c.on};background:rgba(213,167,76,.12)}
    .pill ha-icon,.row ha-icon{--mdc-icon-size:18px;width:18px;height:18px;display:block}
    .list{display:grid;gap:4px;max-height:${cfg.listHeight}px;overflow-y:auto}
    .row{all:unset;box-sizing:border-box;display:grid;grid-template-columns:22px minmax(0,1fr) auto auto;align-items:center;gap:10px;min-height:44px;padding:0 12px;border-radius:12px;background:rgba(0,0,0,.18);cursor:pointer;font-size:14px}
    .nm{color:${cfg.c.text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .md{font-weight:600}
    .tp{color:${cfg.c.text};font-variant-numeric:tabular-nums;min-width:84px;text-align:right}
    .ar{color:${cfg.c.muted}}
    .cool{color:#8fc8e8}.heat{color:#f0a36b}.other{color:${cfg.c.onText}}
    .none{display:flex;align-items:center;gap:10px;min-height:44px;padding:0 12px;border-radius:12px;background:rgba(0,0,0,.18);color:${cfg.c.muted};font-size:14px}
    .alloff{all:unset;cursor:pointer;height:38px;padding:0 14px;border-radius:999px;font-size:14px;font-weight:600;color:${cfg.c.text};border:1px solid ${cfg.c.line};background:rgba(255,255,255,.04)}
    .alloff[data-armed="1"]{color:#fff;border-color:${cfg.c.alert};background:rgba(255,120,133,.22)}
    .row:focus-visible,.alloff:focus-visible{outline:2px solid ${cfg.c.onText};outline-offset:2px}
  </style><div class="cs">
    <div class="top"><div><div class="lbl">Inside, average of ${temps.length} rooms</div><div class="big">${inside === null ? '—' : inside.toFixed(1) + '°'}</div>
      ${Number.isFinite(outside) ? `<div class="out">Outside ${Math.round(outside)}°</div>` : ''}</div>
      <div class="sum"><span class="pill${on.length ? ' on' : ''}"><ha-icon icon="mdi:air-conditioner"></ha-icon>${on.length ? on.length + ' of ' + cfg.climates.length + ' on' : 'All off'}</span>
        ${cfg.heating.length ? `<span class="pill${heatOn.length ? ' on' : ''}"><ha-icon icon="mdi:fire"></ha-icon>${heatOn.length ? 'Heating on' : 'Heating off'}</span>` : ''}
        ${anything ? `<button class="alloff" data-label="${label}" data-ids='${JSON.stringify(ids)}' onclick="event.stopPropagation();window.__dwellClimate.off(this)">${label}</button>` : ''}</div></div>
    <div class="list">${anything ? [...on.map(row), ...heatOn.filter(id => !id.startsWith('climate.')).map(heatRow)].join('')
      : `<div class="none"><ha-icon icon="mdi:power-sleep"></ha-icon>Nothing is heating or cooling.</div>`}</div>
  </div>`;
}

function climateStatusCard(cfg) {
  return {
    type: 'custom:button-card', show_name: false, show_icon: false, show_state: false, show_label: false,
    tap_action: {action: 'none'}, hold_action: {action: 'none'}, variables: {dwell_static: true},
    triggers_update: [...cfg.climates, ...cfg.heating, ...(cfg.weather ? [cfg.weather] : [])],
    custom_fields: {status: `[[[ return (${dwellClimateStatus.toString()})(states, ${JSON.stringify(cfg)}); ]]]`},
    styles: {
      card: [{padding: '20px 22px'}, {height: `${CLIMATE_TOP}px`}, {'box-sizing': 'border-box'}, {overflow: 'hidden'}, {'border-radius': '20px'},
        {background: `linear-gradient(135deg,${CL_C.surface},${CL_C.card})`}, {border: `1px solid ${CL_C.line}`}, {'box-shadow': 'none'}, {cursor: 'default'}],
      grid: [{'grid-template-areas': '"status"'}, {'grid-template-columns': '1fr'}, {'align-content': 'start'}],
      custom_fields: {status: [{width: '100%'}, {'pointer-events': 'auto'}]}
    },
    grid_options: {columns: 'full', rows: 'auto'}
  };
}

// Runs inside a button-card template (`card` is the button-card element): climate history for a picked range.
// Top: each room's temperature as a line (tap a name to hide it, hover for values). Below: an activity timeline,
// one row per air conditioner, thermostat and heating device, coloured by what it was doing.
// Self-contained: serialised with toString.
function dwellClimateHistory(card, hass, cfg) {
  const all = window.__dwellClimHist = window.__dwellClimHist || {};
  const store = (() => { try { return window.localStorage; } catch (e) { return null; } })();
  const st = all.c = all.c || {range: store?.getItem('dwelldeck-climate-range') || 'today', from: '', data: null, loading: false, asked: '', hidden: []};
  const RANGES = [['today', 'Today'], ['yesterday', 'Yesterday'], ['24h', 'Last 24 hours'], ['2d', 'Last 2 days'], ['3d', 'Last 3 days'], ['7d', 'Last week'], ['custom', 'Pick a day']];
  const esc = v => String(v).replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
  const day0 = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const span = () => {
    const now = new Date(), today = day0(now);
    if (st.range === 'today') return [today, now];
    if (st.range === 'yesterday') return [new Date(today - 86400000), today];
    if (st.range === '24h') return [new Date(now - 86400000), now];
    if (st.range === 'custom' && st.from) { const f = day0(st.from + 'T00:00'); return [f, new Date(Math.min(+f + 86400000, +now))]; }
    const days = Number.parseInt(st.range, 10) || 1;
    return [new Date(today - (days - 1) * 86400000), now];
  };
  const name = id => cfg.names[id] || hass?.states?.[id]?.attributes?.friendly_name || id.split('.')[1].replaceAll('_', ' ');
  const draw = () => { const t = card?.shadowRoot?.querySelector('.chx'); if (t) t.outerHTML = render(); };
  const load = async () => {
    const [from, to] = span();
    const asked = `${st.range}|${st.from}|${Math.floor(Date.now() / 300000)}`;
    if (st.loading || st.asked === asked) return;
    Object.assign(st, {loading: true, asked});
    try {
      const res = await hass.callWS({type: 'history/history_during_period', start_time: from.toISOString(), end_time: to.toISOString(),
        entity_ids: [...cfg.climates, ...cfg.heating], minimal_response: false, no_attributes: false, significant_changes_only: false});
      const rows = {};
      for (const id of [...cfg.climates, ...cfg.heating]) {
        let attrs = {};
        rows[id] = (res[id] || []).map(item => {
          attrs = item.a || item.attributes || attrs;
          const t = item.lu !== undefined ? item.lu * 1000 : item.lc !== undefined ? item.lc * 1000 : Date.parse(item.last_updated || item.last_changed);
          return {t: Math.max(+from, t), state: item.s ?? item.state, temp: Number(attrs.current_temperature), action: attrs.hvac_action};
        }).filter(row => Number.isFinite(row.t));
      }
      st.data = {from: +from, to: +to, rows, error: ''};
    } catch (e) {
      st.data = {error: 'Could not read the history: ' + (e?.message || e?.code || 'unknown error')};
    }
    st.loading = false;
    draw();
  };
  window.__dwellClimHistLoad = load;
  window.__dwellClimHistUi = window.__dwellClimHistUi || {
    pick(el) {
      const s = window.__dwellClimHist.c; s.range = el.value;
      try { window.localStorage.setItem('dwelldeck-climate-range', el.value); } catch (e) { /* private mode */ }
      el.closest('.chx').querySelector('.custom').hidden = el.value !== 'custom';
      if (el.value !== 'custom') { s.asked = ''; window.__dwellClimHistLoad(); }
    },
    day(el) { const s = window.__dwellClimHist.c; s.from = el.value; if (s.from) { s.asked = ''; window.__dwellClimHistLoad(); } },
    toggle(el) {
      const s = window.__dwellClimHist.c, id = el.dataset.id;
      s.hidden = s.hidden.includes(id) ? s.hidden.filter(x => x !== id) : [...s.hidden, id];
      window.__dwellClimHistDraw?.();
    }
  };
  window.__dwellClimHistDraw = draw;
  const COLORS = ['#8fc8e8', '#f0a36b', '#b9a3e3', '#a8c49a', '#f2c14e', '#e88fa8', '#7fd1c1', '#c9b38f', '#9fb6d6', '#d6e6c9'];
  const fmt = (t, withDay) => {
    const d = new Date(t), time = d.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
    return withDay ? d.toLocaleDateString([], {weekday: 'short', day: 'numeric', month: 'short'}) + ', ' + time : time;
  };
  // What a device was doing, as a colour and a word.
  const activity = (id, row) => {
    const s = row.state;
    if (['unavailable', 'unknown'].includes(s)) return {word: 'Unavailable', color: '#4a5360'};
    if (!id.startsWith('climate.')) return s === 'on' ? {word: 'On', color: '#f2c14e'} : null;
    const a = row.action, m = a && a !== 'idle' && a !== 'off' ? a : s;
    if (s === 'off' || a === 'off') return null;
    if (/cool/.test(m)) return {word: 'Cooling', color: '#8fc8e8'};
    if (/heat_cool|auto/.test(m)) return {word: 'Auto', color: '#b9a3e3'};
    if (/heat/.test(m)) return {word: 'Heating', color: '#f0a36b'};
    if (/dry/.test(m)) return {word: 'Drying', color: '#7fd1c1'};
    if (/fan/.test(m)) return {word: 'Fan', color: '#a8c49a'};
    if (a === 'idle') return {word: 'On, idle', color: '#6b7682'};
    return {word: 'On', color: '#c9b38f'};
  };
  const render = () => {
    const d = st.data;
    const bar = `<div class="hb"><select class="rg" aria-label="Dates" onchange="event.stopPropagation();window.__dwellClimHistUi.pick(this)">${RANGES.map(([v, l]) => `<option value="${v}"${v === st.range ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <span class="custom"${st.range === 'custom' ? '' : ' hidden'}><input class="day" type="date" value="${st.from}" aria-label="Day" onchange="event.stopPropagation();window.__dwellClimHistUi.day(this)"></span>${st.loading && d ? '<span class="busy">Updating…</span>' : ''}</div>`;
    if (!d) return `<div class="chx">${bar}<div class="msg">Loading history…</div></div>`;
    if (d.error) return `<div class="chx">${bar}<div class="msg">${esc(d.error)}</div></div>`;
    const W = 1000, L = 44, R = 10, span = d.to - d.from || 1, multiDay = span > 26 * 3600000;
    const x = t => L + (W - L - R) * (t - d.from) / span;
    // Time ticks: hours for a day, days beyond.
    const ticks = [];
    const stepH = multiDay ? 24 : span > 12 * 3600000 ? 3 : 1;
    const first = new Date(d.from); first.setMinutes(0, 0, 0); if (multiDay) first.setHours(0);
    for (let t = +first; t <= d.to; t += stepH * 3600000) if (t >= d.from) ticks.push(t);
    const tickText = t => multiDay ? new Date(t).toLocaleDateString([], {weekday: 'short', day: 'numeric'}) : fmt(t);
    // Temperature lines.
    const lines = cfg.climates.map((id, k) => ({id, color: COLORS[k % COLORS.length], pts: (d.rows[id] || []).filter(r => Number.isFinite(r.temp))})).filter(l => l.pts.length);
    const shown = lines.filter(l => !st.hidden.includes(l.id));
    const temps = shown.flatMap(l => l.pts.map(p => p.temp));
    let lo = Math.floor(Math.min(...temps, 99) - 1), hi = Math.ceil(Math.max(...temps, -99) + 1);
    if (!temps.length) { lo = 15; hi = 30; }
    const H = 260, T = 10, B = 24, y = v => T + (H - T - B) * (hi - v) / (hi - lo);
    const valueAt = (pts, t) => { let v = null; for (const p of pts) { if (p.t > t) break; v = p.temp; } return v; };
    const step = l => {
      const pts = l.pts.map(p => ({...p}));
      pts.push({t: d.to, temp: pts[pts.length - 1].temp});
      return pts.map((p, i) => (i ? `L${x(p.t).toFixed(1)},${y(pts[i - 1].temp).toFixed(1)} ` : 'M') + `${x(p.t).toFixed(1)},${y(p.temp).toFixed(1)}`).join(' ');
    };
    const yTicks = [...new Set([lo, Math.round((lo + hi) / 2), hi])];
    const grid = yTicks.map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="${cfg.c.line}"/><text x="${L - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${v}°</text>`).join('')
      + ticks.map(t => `<line x1="${x(t).toFixed(1)}" x2="${x(t).toFixed(1)}" y1="${T}" y2="${H - B}" stroke="${cfg.c.line}" stroke-opacity=".5"/><text x="${x(t).toFixed(1)}" y="${H - 6}" text-anchor="middle">${tickText(t)}</text>`).join('');
    const COLS = 120;
    const hover = shown.length ? [...Array(COLS).keys()].map(i => {
      const t = d.from + span * (i + 0.5) / COLS, cx = x(t);
      const rows = [fmt(t, multiDay), ...shown.map(l => `${name(l.id)}: ${valueAt(l.pts, t) ?? '—'}°`)];
      const bw = Math.max(...rows.map(r => r.length)) * 6.6 + 16, bh = rows.length * 15 + 10, bx = cx + 10 + bw > W ? cx - 10 - bw : cx + 10;
      return `<g class="hv"><rect class="hit" x="${(L + (W - L - R) * i / COLS).toFixed(1)}" y="${T}" width="${((W - L - R) / COLS).toFixed(1)}" height="${H - T - B}"/>
        <g class="tip"><line x1="${cx.toFixed(1)}" x2="${cx.toFixed(1)}" y1="${T}" y2="${H - B}" stroke="${cfg.c.muted}" stroke-dasharray="3 3"/>
        ${shown.map(l => { const v = valueAt(l.pts, t); return v === null ? '' : `<circle cx="${cx.toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.5" fill="${l.color}"/>`; }).join('')}
        <rect x="${bx.toFixed(1)}" y="${T + 2}" width="${bw.toFixed(1)}" height="${bh}" rx="6" fill="#0d141c" stroke="${cfg.c.line}"/>
        ${rows.map((r, j) => `<text class="${j ? 'tv' : 'th'}" x="${(bx + 8).toFixed(1)}" y="${T + 18 + j * 15}">${esc(r)}</text>`).join('')}</g></g>`;
    }).join('') : '';
    const legend = `<div class="lg">${lines.map(l => `<button class="lgi${st.hidden.includes(l.id) ? ' off' : ''}" data-id="${l.id}" onclick="event.stopPropagation();window.__dwellClimHistUi.toggle(this)"><i style="background:${l.color}"></i>${esc(name(l.id))}</button>`).join('')}</div>`;
    const tempChart = lines.length ? `<div class="blk"><div class="tt">Room temperature</div>${legend}
      <svg viewBox="0 0 ${W} ${H}">${grid}${shown.map(l => `<path d="${step(l)}" fill="none" stroke="${l.color}" stroke-width="2.2" stroke-linejoin="round"/>`).join('')}${hover}</svg></div>` : '';
    // Activity timeline: one row per device.
    const devices = [...cfg.climates, ...cfg.heating].filter(id => (d.rows[id] || []).length);
    const RH = 30, TH = devices.length * RH + 24, LBL = 190;
    const tx = t => LBL + (W - LBL - R) * (t - d.from) / span;
    const seen = new Map();
    const rowsSvg = devices.map((id, k) => {
      // Readings in a row with the same activity become one bar.
      const runs = [];
      d.rows[id].forEach(r => {
        const a = activity(id, r), last = runs[runs.length - 1];
        if (last && (last.a?.word || '') === (a?.word || '')) return;
        if (last) last.end = r.t;
        runs.push({a, t: r.t, end: d.to});
      });
      const segs = runs.map(run => {
        const a = run.a;
        if (!a) return '';
        seen.set(a.word, a.color);
        const t1 = run.t, t2 = run.end;
        if (t2 <= t1) return '';
        return `<rect x="${tx(t1).toFixed(1)}" y="${k * RH + 6}" width="${Math.max(1.5, tx(t2) - tx(t1)).toFixed(1)}" height="${RH - 12}" rx="4" fill="${a.color}"><title>${esc(name(id))} · ${a.word} · ${fmt(t1, multiDay)} – ${fmt(t2, multiDay)}</title></rect>`;
      }).join('');
      return `<text class="rl" x="0" y="${k * RH + RH / 2 + 4}">${esc(name(id).length > 26 ? name(id).slice(0, 25) + '…' : name(id))}</text>
        <line x1="${LBL}" x2="${W - R}" y1="${k * RH + RH / 2}" y2="${k * RH + RH / 2}" stroke="${cfg.c.line}"/>${segs}`;
    }).join('');
    const tTicks = ticks.map(t => `<line x1="${tx(t).toFixed(1)}" x2="${tx(t).toFixed(1)}" y1="0" y2="${devices.length * RH}" stroke="${cfg.c.line}" stroke-opacity=".5"/><text x="${tx(t).toFixed(1)}" y="${TH - 6}" text-anchor="middle">${tickText(t)}</text>`).join('');
    const key = `<div class="lg">${[...seen].map(([word, color]) => `<span class="key"><i style="background:${color}"></i>${word}</span>`).join('')}</div>`;
    const timeline = devices.length ? `<div class="blk"><div class="tt">Activity</div>${key}<svg viewBox="0 0 ${W} ${TH}">${tTicks}${rowsSvg}</svg></div>` : '';
    return `<div class="chx">${bar}${tempChart}${timeline || ''}${!tempChart && !timeline ? '<div class="msg">No climate history for these dates.</div>' : ''}</div>`;
  };
  const style = `<style>
    .chx{display:grid;gap:14px;text-align:left}
    .hb{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
    .rg,.day{font:inherit;font-size:14px;color:${cfg.c.text};background:#101820;border:1px solid ${cfg.c.line};border-radius:10px;height:38px;padding:0 10px;color-scheme:dark}
    .custom[hidden]{display:none}
    .busy{font-size:13px;color:${cfg.c.muted}}
    .blk{padding:14px;border-radius:14px;background:rgba(0,0,0,.18);min-width:0}
    .tt{font-size:16px;font-weight:600;color:${cfg.c.text}}
    .lg{display:flex;flex-wrap:wrap;gap:4px 12px;margin:8px 0 6px;font-size:13px;color:${cfg.c.muted}}
    .lg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px}
    .lgi{all:unset;cursor:pointer;border-radius:8px;padding:3px 6px}
    .lgi:hover{background:rgba(255,255,255,.06)}
    .lgi.off{opacity:.45;text-decoration:line-through}
    .lgi.off i{background:transparent!important;outline:1.5px solid ${cfg.c.muted};outline-offset:-1.5px}
    .lgi:focus-visible,.rg:focus-visible,.day:focus-visible{outline:2px solid ${cfg.c.onText}}
    .blk svg{display:block;width:100%;height:auto}
    .blk text{font-size:12px;fill:${cfg.c.muted};font-family:inherit}
    .blk .rl{font-size:13px;fill:${cfg.c.text}}
    .hv .hit{fill:transparent}.hv .tip{display:none;pointer-events:none}.hv:hover .tip{display:inline}.hv:hover .hit{fill:rgba(255,255,255,.03)}
    .blk .th{font-size:12.5px;font-weight:600;fill:${cfg.c.text}}.blk .tv{font-size:12.5px;fill:${cfg.c.text}}
    .msg{padding:24px;text-align:center;color:${cfg.c.muted};font-size:14px}
  </style>`;
  if (hass?.callWS) setTimeout(() => load(), 0);
  return style + render();
}

function climateHistoryCard(cfg) {
  return {
    type: 'custom:button-card', show_name: false, show_icon: false, show_state: false, show_label: false,
    tap_action: {action: 'none'}, hold_action: {action: 'none'}, variables: {dwell_static: true},
    custom_fields: {history: `[[[ return (${dwellClimateHistory.toString()})(this, hass, ${JSON.stringify(cfg)}); ]]]`},
    styles: {
      card: [{padding: '16px'}, {'border-radius': '20px'}, {background: `linear-gradient(135deg,${CL_C.surface},${CL_C.card})`}, {border: `1px solid ${CL_C.line}`}, {'box-shadow': 'none'}, {cursor: 'default'}],
      grid: [{'grid-template-areas': '"history"'}, {'grid-template-columns': '1fr'}],
      custom_fields: {history: [{width: '100%'}, {'min-width': '0'}, {'pointer-events': 'auto'}]}
    },
    grid_options: {columns: 'full', rows: 'auto'}
  };
}

export function designClimate(output, {hass = {}} = {}) {
  const view = output.views.find(item => item.path === 'climate');
  if (!view?.sections?.length) return output;
  const cards = view.sections.flatMap(section => section.cards || []);
  const acTiles = cards.filter(card => card.type === 'tile' && card.entity?.startsWith('climate.'));
  const thermostats = cards.filter(card => card.type === 'thermostat');
  const scenes = cards.filter(card => card.type === 'tile' && card.entity?.startsWith('scene.'));
  const heating = cards.filter(card => card.type === 'tile' && /^(switch|input_boolean)\./.test(card.entity || ''));
  const history = cards.filter(card => card.type === 'history-graph');
  const used = new Set([...acTiles, ...thermostats, ...scenes, ...heating, ...history]);
  // The old live status list is replaced by the status card; anything else is kept.
  const rest = cards.filter(card => card.type !== 'heading' && !used.has(card) && card.name !== 'AC live status');
  const bound = id => typeof id === 'string' && !id.includes('.dwelldeck_slot_');
  const weather = output.views.flatMap(item => item.sections || []).flatMap(section => section.cards || []).map(card => card.entity).find(id => bound(id) && id.startsWith('weather.'));
  const climates = [...new Set([...acTiles, ...thermostats].map(card => card.entity).filter(bound))];
  const status = climateStatusCard({climates, heating: heating.map(card => card.entity).filter(bound), weather: weather || null,
    listHeight: CLIMATE_TOP - 150, c: {text: CL_C.text, muted: CL_C.muted, line: CL_C.line, on: CL_C.on, onText: CL_C.onText, alert: CL_C.alert}});
  // Heating tiles fill the column beside the status card, one height each.
  // More than three: two across, so each stays a comfortable size.
  const across = heating.length > 3 ? 2 : 1, rows = Math.ceil(heating.length / across);
  const heatHeight = rows ? Math.max(56, Math.floor((CLIMATE_TOP - 8 * (rows - 1)) / rows)) : 56;
  for (const tile of heating) {
    tile.grid_options = {columns: 12 / across, rows: 'auto'};
    const css = `ha-card { height: ${heatHeight}px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; border-radius: 16px; }`;
    tile.card_mod = {...(tile.card_mod || {}), style: `${tile.card_mod?.style || ''} ${css}`};
  }
  // Air conditioners and thermostats: three across on a wide screen, one per row on a phone.
  for (const tile of acTiles) tile.grid_options = {columns: 12, rows: 3};
  for (const card of thermostats) card.grid_options = {columns: 12, rows: 'auto'};
  // Six across on a wide screen, two across on a phone.
  for (const card of scenes) card.grid_options = {columns: 6, rows: 1};
  for (const card of history) card.grid_options = {columns: 'full', rows: 'auto'};

  const names = Object.fromEntries([...acTiles, ...thermostats, ...heating].filter(card => card.name && bound(card.entity) && !card.name.includes('__DWELLDECK'))
    .map(card => [card.entity, card.name]));
  for (const id of [...climates, ...heating.map(card => card.entity)]) if (!names[id] && hass.states?.[id]?.attributes?.friendly_name) names[id] = hass.states[id].attributes.friendly_name;
  const historyCard = (climates.length || heating.length) ? climateHistoryCard({climates, heating: heating.map(card => card.entity).filter(bound), names,
    c: {text: CL_C.text, muted: CL_C.muted, line: CL_C.line, onText: CL_C.onText}}) : history[0];
  const section = (items, span) => ({type: 'grid', ...(span ? {column_span: span} : {}), cards: items.filter(Boolean)});
  view.sections = [
    section([clHeading('Climate now', 'mdi:home-thermometer'), status], 2),
    section([clHeading('Heating', 'mdi:water-boiler'), ...heating]),
    // AC scenes right above the air conditioners they start, in one row.
    section([clHeading('AC scenes', 'mdi:play-box-outline'), ...scenes], 3),
    section([clHeading('Air conditioners', 'mdi:air-conditioner'), ...acTiles], 3),
    section([clHeading('Thermostats', 'mdi:thermostat'), ...thermostats], 3),
    // Full width: room temperatures, and under them what each device was doing, one row each.
    section([clHeading('History', 'mdi:chart-timeline-variant'), historyCard, ...rest], 3)
  ].filter(item => item.cards.length > 1);
  view.max_columns = 3;
  return output;
}
