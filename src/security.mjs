// Security: what needs you first (alarm, open doors, safety sensors, gates, offline cameras), then the alarm
// panel, gates, cameras, detection and shortcuts.
import {ROOM_COLORS} from './rooms.mjs';

const SEC_C = ROOM_COLORS;
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
    custom_fields: {status: `[[[ return (${dwellSecurityStatus.toString()})(states, hass, ${JSON.stringify(cfg)}); ]]]`},
    styles: {
      card: [{padding: '22px 24px'}, {'border-radius': '20px'}, {background: `linear-gradient(135deg,${SEC_C.surface},${SEC_C.card})`},
        {border: `1px solid ${SEC_C.line}`}, {'box-shadow': 'none'}, {cursor: 'default'}],
      grid: [{'grid-template-areas': '"status"'}, {'grid-template-columns': '1fr'}],
      custom_fields: {status: [{width: '100%'}, {'pointer-events': 'auto'}]}
    },
    grid_options: {columns: 'full', rows: 'auto'}
  };
}

// Page buttons as the same shortcut cards as Home: icon on top, name, one line of what it opens.
const SHORTCUT_HINTS = {'security-sensors': 'Doors, motion and safety', notifications: 'Last 24 hours', cameras: 'Every camera, live'};
function securityShortcut(card) {
  const path = card.tap_action?.navigation_path || '';
  const view = path.split('/').pop();
  const label = card.name === 'Detection history' ? 'People and vehicles' : card.name === 'Detection snapshots' ? 'Latest picture per sensor' : SHORTCUT_HINTS[view] || '';
  return {
    type: 'custom:button-card', name: card.name, icon: card.icon, label, show_label: !!label, show_state: false,
    tap_action: card.tap_action, hold_action: {action: 'none'}, variables: {dwell_static: true},
    styles: {
      grid: [{'grid-template-areas': '"i" "n" "l"'}, {'grid-template-columns': '1fr'}, {'grid-template-rows': '40px min-content min-content'}, {'row-gap': '2px'}, {'align-content': 'space-between'}, {height: '100%'}],
      card: [{padding: '14px'}, {height: '120px'}, {'box-sizing': 'border-box'}, {'border-radius': '20px'}, {background: `linear-gradient(135deg,${SEC_C.surface},${SEC_C.card})`}, {border: `1px solid ${SEC_C.line}`}, {'box-shadow': 'none'}],
      img_cell: [{'justify-self': 'start'}, {width: '40px'}, {height: '40px'}, {'border-radius': '12px'}, {background: 'rgba(0,0,0,.18)'}],
      icon: [{width: '22px'}, {color: SEC_C.muted}],
      name: [{'justify-self': 'start'}, {'font-size': '15px'}, {'font-weight': '600'}, {color: SEC_C.text}, {'margin-top': '8px'}, {'white-space': 'nowrap'}, {overflow: 'hidden'}, {'text-overflow': 'ellipsis'}, {'max-width': '100%'}],
      label: [{'justify-self': 'start'}, {'font-size': '13px'}, {color: SEC_C.muted}, {'white-space': 'nowrap'}, {overflow: 'hidden'}, {'text-overflow': 'ellipsis'}, {'max-width': '100%'}]
    },
    grid_options: {columns: 6, rows: 'auto'}
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
  for (const card of [...cameras, ...gateNotes, ...alarmPanel]) card.grid_options = {columns: 12, rows: 'auto'};

  const status = securityStatusCard({
    alarm: alarmId && !alarmId.includes('.dwelldeck_slot_') ? alarmId : null,
    paths: {sensors: `${prefix}/security-sensors`, cameras: `${prefix}/cameras`},
    c: SEC_C
  });
  const section = (items, span) => ({type: 'grid', ...(span ? {column_span: span} : {}), cards: items});
  const sections = [
    section([status], 2),
    section([secHeading('Alarm', 'mdi:shield-home'), ...alarmPanel]),
    section([secHeading('Gates', 'mdi:gate'), ...gates, ...loose, ...gateNotes]),
    section([secHeading('Entrance cameras', 'mdi:cctv'), ...cameras], 2),
    section([secHeading('Camera detection', 'mdi:motion-sensor'), ...detection.filter(card => !navigates(card))], 2),
    section([secHeading('Shortcuts', 'mdi:view-grid-outline'), ...shortcuts.map(securityShortcut), ...rest])
  ];
  view.sections = sections.filter(item => item.cards.length > 1 || item.cards[0] === status);
  return output;
}
