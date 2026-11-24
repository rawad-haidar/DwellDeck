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

  const section = (items, span) => ({type: 'grid', ...(span ? {column_span: span} : {}), cards: items});
  view.sections = [
    section([clHeading('Climate now', 'mdi:home-thermometer'), status], 2),
    section([clHeading('Heating', 'mdi:water-boiler'), ...heating]),
    // AC scenes right above the air conditioners they start, in one row.
    section([clHeading('AC scenes', 'mdi:play-box-outline'), ...scenes], 3),
    section([clHeading('Air conditioners', 'mdi:air-conditioner'), ...acTiles], 3),
    section([clHeading('Thermostats', 'mdi:thermostat'), ...thermostats], 3),
    section([clHeading('Last 24 hours', 'mdi:chart-timeline-variant'), ...history, ...rest], 2)
  ].filter(item => item.cards.length > 1);
  view.max_columns = 3;
  return output;
}
