// Security: what needs you first (alarm, open doors, safety sensors, gates, offline cameras), then the alarm
// panel, gates, cameras, detection and shortcuts.
import {ROOM_COLORS} from './rooms.mjs';
import {touchSafe} from './util.mjs';

const SEC_C = ROOM_COLORS;
// Height of the top row's cards, so status, alarm and gates line up at top and bottom.
const TOP_ROW = 288;
const secHeading = (text, icon) => ({type: 'heading', heading: text, icon, heading_style: 'title'});

// Runs inside a button-card template: the alarm state, status pills and a list of what needs attention.
// Self-contained: serialised with toString.
function dwellSecurityStatus(states, hass, cfg) {
  const reg = hass?.entities || {};
  const shown = id => states[id] && !reg[id]?.hidden && !reg[id]?.hidden_by && !reg[id]?.entity_category;
  const all = Object.keys(states).filter(shown);
  const binary = all.filter(id => id.startsWith('binary_sensor.'));
  const cls = (id, list) => list.includes(states[id].attributes?.device_class);
  const name = id => states[id].attributes?.friendly_name || id.split('.')[1].replaceAll('_', ' ');
  const esc = v => String(v).replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
  const ago = id => {
    const min = Math.round((Date.now() - Date.parse(states[id].last_changed)) / 60000);
    if (!Number.isFinite(min)) return '';
    return min < 1 ? 'just now' : min < 60 ? min + ' min ago' : min < 1440 ? Math.round(min / 60) + ' h ago' : Math.round(min / 1440) + ' d ago';
  };
  const safety = binary.filter(id => cls(id, ['smoke', 'gas', 'moisture', 'carbon_monoxide', 'safety', 'problem', 'tamper', 'heat']) && states[id].state === 'on');
  const openings = binary.filter(id => cls(id, ['door', 'window', 'garage_door', 'opening']) && states[id].state === 'on');
  const motion = binary.filter(id => cls(id, ['motion', 'occupancy', 'presence']) && states[id].state === 'on');
  const locks = all.filter(id => id.startsWith('lock.'));
  const unlocked = locks.filter(id => ['unlocked', 'open', 'opening', 'unlocking', 'jammed'].includes(states[id].state));
  const cameras = all.filter(id => id.startsWith('camera.'));
  const offline = cameras.filter(id => ['unavailable', 'unknown'].includes(states[id].state));
  const alarm = cfg.alarm && states[cfg.alarm];
  const a = alarm?.state || '';
  const alarmText = !alarm ? 'No alarm selected' : a === 'triggered' ? 'Alarm triggered' : a === 'disarmed' ? 'Disarmed'
    : a.startsWith('armed_') ? 'Armed ' + a.slice(6).replaceAll('_', ' ') : a.charAt(0).toUpperCase() + a.slice(1).replaceAll('_', ' ');
  const alarmTone = a === 'triggered' ? 'alert' : a.startsWith('armed') ? 'safe' : ['arming', 'pending'].includes(a) ? 'on' : 'off';
  const color = tone => tone === 'alert' ? cfg.c.alert : tone === 'safe' ? cfg.c.active : tone === 'on' ? cfg.c.onText : cfg.c.muted;
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const go = path => `event.stopPropagation();history.pushState(null,'','${path}');window.dispatchEvent(new CustomEvent('location-changed'));`;
  const info = id => `event.stopPropagation();this.dispatchEvent(new CustomEvent('hass-more-info',{detail:{entityId:'${id}'},bubbles:true,composed:true}));`;
  const pills = [
    {icon: 'mdi:alert', text: safety.length ? plural(safety.length, 'safety alert', 'safety alerts') : 'No safety alerts', tone: safety.length ? 'alert' : 'off', path: cfg.paths.sensors},
    {icon: 'mdi:door-open', text: openings.length ? plural(openings.length, 'door or window open', 'doors or windows open') : 'Doors and windows closed', tone: openings.length ? 'on' : 'off', path: cfg.paths.sensors},
    {icon: 'mdi:motion-sensor', text: motion.length ? plural(motion.length, 'motion now', 'motions now') : 'No motion', tone: motion.length ? 'safe' : 'off', path: cfg.paths.sensors}
  ];
  if (locks.length) pills.push({icon: unlocked.length ? 'mdi:lock-open-variant' : 'mdi:lock', text: unlocked.length ? plural(unlocked.length, 'gate unlocked', 'gates unlocked') : 'Gates locked', tone: unlocked.length ? 'on' : 'off'});
  if (cameras.length) pills.push({icon: offline.length ? 'mdi:video-off' : 'mdi:cctv', text: offline.length ? `${offline.length} of ${cameras.length} cameras offline` : `${cameras.length} cameras online`, tone: offline.length ? 'on' : 'off', path: cfg.paths.cameras});
  // Needs attention, most serious first.
  const rows = [
    ...(a === 'triggered' ? [{id: cfg.alarm, icon: 'mdi:alarm-light', text: 'Alarm triggered', tone: 'alert'}] : []),
    ...safety.map(id => ({id, icon: 'mdi:alert', text: 'Alert', tone: 'alert'})),
    ...unlocked.map(id => ({id, icon: 'mdi:lock-open-variant', text: states[id].state === 'jammed' ? 'Jammed' : 'Unlocked', tone: states[id].state === 'jammed' ? 'alert' : 'on'})),
    ...openings.map(id => ({id, icon: states[id].attributes?.device_class === 'window' ? 'mdi:window-open-variant' : 'mdi:door-open', text: 'Open', tone: 'on'})),
    ...offline.map(id => ({id, icon: 'mdi:video-off', text: 'Offline', tone: 'off'}))
  ];
  const shownRows = rows.slice(0, 6);
  const row = r => `<button class="row" onclick="${info(r.id)}"><ha-icon icon="${r.icon}" style="color:${color(r.tone)}"></ha-icon>
    <span class="nm">${esc(name(r.id))}</span><span class="st" style="color:${color(r.tone)}">${r.text}</span><span class="ago">${ago(r.id)}</span></button>`;
  const list = rows.length
    ? shownRows.map(row).join('') + (rows.length > shownRows.length ? `<button class="more" onclick="${go(cfg.paths.sensors)}">${rows.length - shownRows.length} more</button>` : '')
    : `<div class="clear"><ha-icon icon="mdi:shield-check" style="color:${cfg.c.active}"></ha-icon><span>All clear. No alerts, nothing open and every camera online.</span></div>`;
  const pill = p => `<button class="pill ${p.tone}" ${p.path ? `onclick="${go(p.path)}"` : 'tabindex="-1"'}><ha-icon icon="${p.icon}"></ha-icon><span>${p.text}</span></button>`;
  return `<style>
    .s{display:grid;gap:18px;text-align:left}
    .top{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px 24px}
    .alarm{display:flex;align-items:center;gap:14px;cursor:pointer;min-width:220px}
    .shield{display:grid;place-items:center;width:56px;height:56px;border-radius:16px;background:rgba(0,0,0,.18);color:${color(alarmTone)}}
    .shield ha-icon{--mdc-icon-size:30px}
    .hi{font-size:14px;color:${cfg.c.muted}}
    .big{font-size:32px;line-height:1.1;font-weight:600;letter-spacing:-.5px;color:${alarmTone === 'off' ? cfg.c.text : color(alarmTone)}}
    .pills{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;flex:1 1 320px}
    .pill{display:flex;align-items:center;gap:8px;height:40px;padding:0 14px;border-radius:999px;font:inherit;font-size:14px;cursor:pointer;
      color:${cfg.c.muted};background:rgba(0,0,0,.18);border:1px solid ${cfg.c.line};white-space:nowrap}
    .pill[tabindex="-1"]{cursor:default}
    .pill ha-icon{--mdc-icon-size:18px}
    .pill.on{color:${cfg.c.onText};background:rgba(213,167,76,.14);border-color:${cfg.c.on}}
    .pill.safe{color:${cfg.c.active};border-color:${cfg.c.active}}
    .pill.alert{color:#fff;background:rgba(255,120,133,.22);border-color:${cfg.c.alert}}
    .label{font-size:15px;font-weight:600;color:${cfg.c.text};margin-bottom:6px}
    .list{display:grid;gap:4px}
    .row,.more{all:unset;box-sizing:border-box;display:grid;grid-template-columns:22px minmax(0,1fr) auto auto;align-items:center;gap:10px;
      min-height:44px;padding:0 12px;border-radius:12px;background:rgba(0,0,0,.18);cursor:pointer;font-size:14px}
    .row ha-icon{--mdc-icon-size:20px}
    .nm{color:${cfg.c.text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .st{font-weight:600}
    .ago{color:${cfg.c.muted};font-size:13px;min-width:64px;text-align:right}
    .more{display:block;text-align:center;color:${cfg.c.muted}}
    .row:focus-visible,.more:focus-visible,.pill:focus-visible,.alarm:focus-visible{outline:2px solid ${cfg.c.onText};outline-offset:2px}
    .clear{display:flex;align-items:center;gap:10px;min-height:44px;padding:0 12px;border-radius:12px;background:rgba(0,0,0,.18);color:${cfg.c.muted};font-size:14px}
    @media (max-width:600px){.big{font-size:26px}.pills{justify-content:flex-start}.ago{display:none}.row{grid-template-columns:22px minmax(0,1fr) auto}}
  </style>
  <div class="s">
    <div class="top">
      <div class="alarm" ${alarm ? `role="button" tabindex="0" onclick="${info(cfg.alarm)}"` : ''}><div class="shield"><ha-icon icon="${a === 'disarmed' ? 'mdi:shield-off-outline' : a === 'triggered' ? 'mdi:alarm-light' : 'mdi:shield-check'}"></ha-icon></div>
        <div><div class="hi">${alarm ? esc(name(cfg.alarm)) : 'Alarm'}${alarm ? ' · ' + ago(cfg.alarm) : ''}</div><div class="big">${alarmText}</div></div></div>
      <div class="pills">${pills.map(pill).join('')}</div>
    </div>
    <div><div class="label">${rows.length ? 'Needs attention' : 'Status'}</div><div class="list">${list}</div></div>
  </div>`;
}

function securityStatusCard(cfg) {
  return {
    type: 'custom:button-card', show_name: false, show_icon: false, show_state: false, show_label: false,
    tap_action: {action: 'none'}, hold_action: {action: 'none'}, triggers_update: 'all', variables: {dwell_static: true},
    custom_fields: {status: touchSafe(`(${dwellSecurityStatus.toString()})(states, hass, ${JSON.stringify(cfg)})`)},
    styles: {
      // The top row (status, alarm, gates) shares one height; a long attention list scrolls inside.
      card: [{padding: '22px 24px'}, {height: `${TOP_ROW}px`}, {'box-sizing': 'border-box'}, {'overflow-y': 'auto'}, {'border-radius': '20px'}, {background: `linear-gradient(135deg,${SEC_C.surface},${SEC_C.card})`},
        {border: `1px solid ${SEC_C.line}`}, {'box-shadow': 'none'}, {cursor: 'default'}],
      grid: [{'grid-template-areas': '"status"'}, {'grid-template-columns': '1fr'}],
      custom_fields: {status: [{width: '100%'}, {'pointer-events': 'auto'}]}
    },
    grid_options: {columns: 'full', rows: 'auto'}
  };
}

const SHORTCUT_HINTS = {'security-sensors': 'Doors, motion and safety', notifications: 'Last 24 hours', cameras: 'Every camera, live'};

// Shortcuts as one full-width row of buttons: icon, name and what it opens, nothing cut off. On a phone they
// wrap two by two. Self-contained: serialised with toString.
function dwellShortcutBar(states, cfg) {
  window.__dwellGo = window.__dwellGo || (el => { history.pushState(null, '', el.dataset.path); window.dispatchEvent(new CustomEvent('location-changed')); });
  const esc = v => String(v).replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
  return `<style>
    .bar{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px}
    .go{all:unset;box-sizing:border-box;display:grid;grid-template-columns:40px minmax(0,1fr) 16px;align-items:center;gap:12px;min-height:64px;padding:10px 12px;
      border-radius:16px;background:rgba(0,0,0,.18);border:1px solid ${cfg.c.line};cursor:pointer;text-align:left;transition:border-color .2s ease,background .2s ease}
    .go:hover{border-color:${cfg.c.on};background:rgba(213,167,76,.08)}
    .go:focus-visible{outline:2px solid ${cfg.c.onText};outline-offset:2px}
    .ic{display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:rgba(0,0,0,.22);color:${cfg.c.onText}}
    .ic ha-icon{--mdc-icon-size:22px;width:22px;height:22px;display:block}
    .nm{font-size:15px;font-weight:600;color:${cfg.c.text};line-height:1.25}
    .ht{font-size:13px;color:${cfg.c.muted};line-height:1.3;margin-top:2px}
    .ar{color:${cfg.c.muted}}
    .ar ha-icon{--mdc-icon-size:16px;width:16px;height:16px;display:block}
    @media (prefers-reduced-motion:reduce){.go{transition:none}}
  </style><div class="bar">${cfg.items.map(item => `<button class="go" data-path="${esc(item.path)}" onclick="event.stopPropagation();window.__dwellGo(this)">
    <span class="ic"><ha-icon icon="${item.icon}"></ha-icon></span><span style="min-width:0"><div class="nm">${esc(item.name)}</div>${item.hint ? `<div class="ht">${esc(item.hint)}</div>` : ''}</span>
    <span class="ar"><ha-icon icon="mdi:chevron-right"></ha-icon></span></button>`).join('')}</div>`;
}

function shortcutBar(cards) {
  // One button per page: two buttons that open the same page become one.
  const seen = new Set();
  const items = cards.filter(card => card.tap_action?.navigation_path && !seen.has(card.tap_action.navigation_path) && seen.add(card.tap_action.navigation_path)).map(card => {
    const path = card.tap_action.navigation_path;
    const view = path.split('/').pop();
    const name = card.name === 'Recent history' ? 'History' : card.name === 'Detection snapshots' ? 'Snapshots' : card.name.replace(/^All \d+ cameras$/, 'All cameras');
    const hint = view === 'notifications' ? 'Alerts, last 24 hours' : card.name === 'Detection snapshots' ? 'Pictures by camera, last 30 days'
      : SHORTCUT_HINTS[view] || '';
    return {name, hint, icon: card.icon, path};
  });
  return {
    type: 'custom:button-card', show_name: false, show_icon: false, show_state: false, show_label: false,
    tap_action: {action: 'none'}, hold_action: {action: 'none'}, variables: {dwell_static: true},
    custom_fields: {bar: touchSafe(`(${dwellShortcutBar.toString()})(states, ${JSON.stringify({items, c: SEC_C})})`)},
    styles: {card: [{padding: '0'}, {background: 'transparent'}, {border: 'none'}, {'box-shadow': 'none'}, {cursor: 'default'}],
      grid: [{'grid-template-areas': '"bar"'}, {'grid-template-columns': '1fr'}],
      custom_fields: {bar: [{width: '100%'}, {'pointer-events': 'auto'}]}},
    grid_options: {columns: 'full', rows: 'auto'}
  };
}

// The unlock button sits on the same row as its gate's status, one row high.
function unlockButton(card) {
  return {
    type: 'custom:button-card', name: 'Unlock', icon: card.icon || 'mdi:gate-open', show_state: false,
    tap_action: card.tap_action, hold_action: {action: 'none'}, variables: {dwell_static: true},
    styles: {
      grid: [{'grid-template-areas': '"i n"'}, {'grid-template-columns': '24px auto'}, {gap: '0 8px'}, {'justify-content': 'center'}, {'align-items': 'center'}],
      card: [{height: '56px'}, {padding: '0 12px'}, {'box-sizing': 'border-box'}, {'border-radius': '12px'}, {background: 'rgba(213,167,76,.14)'}, {border: `1px solid ${SEC_C.on}`}, {'box-shadow': 'none'}],
      icon: [{width: '22px'}, {color: SEC_C.onText}],
      name: [{'font-size': '14px'}, {'font-weight': '600'}, {color: SEC_C.onText}]
    },
    grid_options: {columns: 4, rows: 1}
  };
}

export function designSecurity(output, {prefix}) {
  const view = output.views.find(item => item.path === 'security');
  if (!view?.sections?.length) return output;
  const detectionSection = view.sections.find(section => section.cards?.some(card => card.type === 'heading' && card.heading === 'Camera detection'));
  const cards = view.sections.filter(section => section !== detectionSection).flatMap(section => section.cards || []);
  const detection = (detectionSection?.cards || []).filter(card => card.type !== 'heading');
  const navigates = card => card.tap_action?.action === 'navigate';
  const alarmPanel = cards.filter(card => card.type === 'alarm-panel');
  const lockTiles = cards.filter(card => card.type === 'tile' && card.entity?.startsWith('lock.'));
  const unlocks = cards.filter(card => card.tap_action?.perform_action === 'lock.unlock');
  const gateSection = view.sections.find(section => section.cards?.some(card => lockTiles.includes(card)));
  const gateNotes = (gateSection?.cards || []).filter(card => card.type === 'markdown');
  const cameras = cards.filter(card => card.type === 'picture-entity');
  const shortcuts = [...cards, ...detection].filter(navigates);
  const used = new Set([...alarmPanel, ...lockTiles, ...unlocks, ...gateNotes, ...cameras, ...shortcuts]);
  const rest = cards.filter(card => card.type !== 'heading' && !used.has(card));
  const alarmId = alarmPanel[0]?.entity;

  // Each gate: its status and its unlock button on one row.
  const gates = lockTiles.flatMap(tile => {
    const unlock = unlocks.find(card => [].concat(card.tap_action.target?.entity_id).includes(tile.entity));
    tile.grid_options = {columns: unlock ? 8 : 12, rows: 1};
    return unlock ? [tile, unlockButton(unlock)] : [tile];
  });
  const loose = unlocks.filter(card => !lockTiles.some(tile => [].concat(card.tap_action.target?.entity_id).includes(tile.entity))).map(unlockButton);
  for (const card of [...cameras, ...alarmPanel]) card.grid_options = {columns: 12, rows: 'auto'};
  // The alarm panel is at least as tall as the status card, its content centred. A keypad makes it taller.
  for (const card of alarmPanel) {
    const css = `ha-card { min-height: ${TOP_ROW}px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; border-radius: 20px; }`;
    card.card_mod = {...(card.card_mod || {}), style: `${card.card_mod?.style || ''} ${css}`};
  }
  // No note under the gates: each gate row grows so the column ends on the same line as status and alarm.
  const gateRows = lockTiles.length + loose.length;
  const rowHeight = gateRows ? Math.max(56, Math.floor((TOP_ROW - 8 * (gateRows - 1)) / gateRows)) : 56;
  for (const tile of lockTiles) {
    tile.grid_options = {...tile.grid_options, rows: 'auto'};
    const css = `ha-card { height: ${rowHeight}px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; border-radius: 20px; }`;
    tile.card_mod = {...(tile.card_mod || {}), style: `${tile.card_mod?.style || ''} ${css}`};
  }
  for (const button of [...gates, ...loose].filter(card => card.name === 'Unlock')) {
    button.grid_options = {...button.grid_options, rows: 'auto'};
    button.styles.card = button.styles.card.map(rule => 'height' in rule ? {height: `${rowHeight}px`} : 'border-radius' in rule ? {'border-radius': '20px'} : rule);
    // Icon above the word in a tall button.
    if (rowHeight > 90) button.styles.grid = [{'grid-template-areas': '"i" "n"'}, {'grid-template-columns': '1fr'}, {gap: '6px'}, {'justify-items': 'center'}, {'align-content': 'center'}];
  }

  const status = securityStatusCard({
    alarm: alarmId && !alarmId.includes('.dwelldeck_slot_') ? alarmId : null,
    paths: {sensors: `${prefix}/security-sensors`, cameras: `${prefix}/cameras`},
    c: SEC_C
  });
  const section = (items, span) => ({type: 'grid', ...(span ? {column_span: span} : {}), cards: items});
  const sections = [
    // Every section has a heading, so the top row starts on one line.
    section([secHeading('Status', 'mdi:shield-check-outline'), status], 2),
    section([secHeading('Alarm', 'mdi:shield-home'), ...alarmPanel]),
    section([secHeading('Gates', 'mdi:gate'), ...gates, ...loose]),
    // Full width (Home Assistant narrows a span to the columns the screen has), above cameras and detection.
    section([secHeading('Shortcuts', 'mdi:view-grid-outline'), shortcutBar(shortcuts), ...rest], 4),
    section([secHeading('Entrance cameras', 'mdi:cctv'), ...cameras], 2),
    section([secHeading('Camera detection', 'mdi:motion-sensor'), ...detection.filter(card => !navigates(card))], 2)
  ];
  view.sections = sections.filter(item => item.cards.length > 1);
  return output;
}
