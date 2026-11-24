// Security view: live human and vehicle detection status and recent activity per camera.
// Sensors are discovered by name, like the Activity view's detection status card.
import {normalizeName} from './util.mjs';

// Collects one row per human/vehicle binary sensor and kind into ns.rows: {cam, kind, on, unavailable, t}.
// The camera name is the sensor name without its detection words, e.g. "Front Gate Smart Motion Human" -> "Front Gate".
const DETECTION_SCAN = `{%- set ns = namespace(rows=[]) -%}
{%- for s in states.binary_sensor -%}
  {%- set label = (s.entity_id ~ ' ' ~ s.name) | lower -%}
  {#- A sensor named for both, like "Human Vehicle Detection", counts as both, as in the Activity view. -#}
  {%- set kinds = (['human'] if ('person' in label or 'human' in label) else []) + (['vehicle'] if ('vehicle' in label or 'car detection' in label) else []) -%}
  {%- set cam = s.name | regex_replace('(?i)(smart motion|authorized|person|human|vehicle|car detection|detection)', '') | regex_replace(' +', ' ') | trim -%}
  {%- for kind in kinds -%}
    {%- set ns.rows = ns.rows + [{'cam': cam or s.name, 'kind': kind, 'on': s.state == 'on', 'unavailable': s.state in ['unavailable', 'unknown'], 't': s.last_changed}] -%}
  {%- endfor -%}
{%- endfor -%}`;

const NO_SENSORS = `No human or vehicle detection sensors found yet. Name your camera detection binary sensors with **person**, **human**, **vehicle** or **car detection**, for example *Front Gate Human*.`;

const STATUS = `${DETECTION_SCAN}
### Detection status
{% if not ns.rows %}${NO_SENSORS}{% else -%}
{%- for title, icon, kind in [('Human', '🧍', 'human'), ('Vehicle', '🚗', 'vehicle')] -%}
{%- set rows = ns.rows | selectattr('kind', 'eq', kind) | list -%}
{%- set active = rows | selectattr('on') | map(attribute='cam') | unique | list -%}
{%- set recent = rows | rejectattr('unavailable') | sort(attribute='t', reverse=true) | list -%}
{{ icon }} **{{ title }}** · {% if not rows %}no sensors found{% elif active %}**Detected now:** {{ active | join(', ') }}{% elif recent %}Clear · last activity **{{ recent[0].cam }}**, {{ relative_time(recent[0].t) }} ago{% else %}all sensors unavailable{% endif %}

{% endfor %}
{%- set counts = namespace(parts=[]) -%}
{%- for title, kind in [('Human', 'human'), ('Vehicle', 'vehicle')] -%}
{%- set rows = ns.rows | selectattr('kind', 'eq', kind) | list -%}
{%- set offline = rows | selectattr('unavailable') | list | count -%}
{%- set counts.parts = counts.parts + [title ~ ': ' ~ (rows | count) ~ ' sensor' ~ ('' if rows | count == 1 else 's') ~ ((' (' ~ offline ~ ' unavailable)') if offline else '')] -%}
{%- endfor %}

_{{ counts.parts | join(' · ') }}_
{%- endif %}`;

const RECENT = `${DETECTION_SCAN}
{%- macro cell(rows, kind) -%}
{%- set m = rows | selectattr('kind', 'eq', kind) | sort(attribute='t', reverse=true) | list -%}
{%- if not m -%}—
{%- elif m | selectattr('on') | list -%}**Detected now**
{%- elif m | rejectattr('unavailable') | list -%}{%- set last = (m | rejectattr('unavailable') | list)[0] -%}Clear · {{ relative_time(last.t) }} ago
{%- else -%}Unavailable
{%- endif -%}
{%- endmacro %}
### Recent camera activity
{% if not ns.rows %}${NO_SENSORS}{% else -%}
{#- Active detections first, then most recent activity, then cameras whose sensors are all unavailable. -#}
{%- set by_time = ns.rows | sort(attribute='t', reverse=true) -%}
{%- set active = by_time | selectattr('on') | map(attribute='cam') | unique | list -%}
{%- set available = by_time | rejectattr('unavailable') | map(attribute='cam') | unique | reject('in', active) | list -%}
{%- set cams = active + available + (by_time | map(attribute='cam') | unique | reject('in', active + available) | list) %}
| Camera | 🧍 Human | 🚗 Vehicle |
|:--|:--|:--|
{% for cam in cams[:12] -%}
{%- set rows = ns.rows | selectattr('cam', 'eq', cam) | list -%}
| {{ cam }} | {{ cell(rows, 'human') }} | {{ cell(rows, 'vehicle') }} |
{% endfor %}
{%- if cams | count > 12 %}
_+{{ cams | count - 12 }} more cameras._
{% endif %}
_Active detections first, then most recent. Times are each sensor's last change, so "Clear · 3 minutes ago" means a detection ended then._
{%- endif %}`;

const detectionStyle = () => ({style: 'ha-card { background: linear-gradient(135deg, #1b2d40, #101c2b); color: #edf5ff; border: 1px solid rgba(156,199,225,.12); border-radius: 16px; --primary-text-color: #edf5ff; --secondary-text-color: #91a8bd; --primary-color: #29d5ee; } ha-markdown table {width: 100%; border-collapse: collapse;} ha-markdown th, ha-markdown td {padding: 6px 8px; border-bottom: 1px solid rgba(156,199,225,.12); text-align: left;}'});

// Snapshots stay in the media folder, which needs a login; /config/www is public.
export const SNAPSHOT_DIR = '/media/dwelldeck/snapshots';
const snapshotImage = id => `media-source://media_source/local/dwelldeck/snapshots/${id}.jpg`;
const DETECTION_WORDS = /(smart motion|authorized|person|human|vehicle|car detection|detection)/gi;

// The same name rules as DETECTION_SCAN, so tiles, status and the Activity view agree.
export function detectionSensors(hass) {
  const states = hass?.states || {};
  const cameras = Object.keys(states).filter(id => id.startsWith('camera.')).sort();
  const sensors = [];
  for (const [id, state] of Object.entries(states)) {
    if (!id.startsWith('binary_sensor.')) continue;
    const name = state.attributes?.friendly_name || id.split('.')[1].replaceAll('_', ' ');
    const label = `${id} ${name}`.toLowerCase();
    const kinds = [...(/person|human/.test(label) ? ['human'] : []), ...(/vehicle|car detection/.test(label) ? ['vehicle'] : [])];
    if (!kinds.length) continue;
    const cam = name.replace(DETECTION_WORDS, '').replace(/ +/g, ' ').trim() || name;
    sensors.push({entity_id: id, kinds, cam, camera: detectionCamera(id, cam, hass, cameras)});
  }
  return sensors.sort((a, b) => a.cam.localeCompare(b.cam) || a.entity_id.localeCompare(b.entity_id));
}

// Prefer a camera on the sensor's own device, then one whose name starts with the camera name;
// among several, prefer the main stream over a sub stream.
function detectionCamera(id, cam, hass, cameras) {
  const device = hass.entities?.[id]?.device_id;
  const onDevice = device ? cameras.filter(camera => hass.entities?.[camera]?.device_id === device) : [];
  const wanted = normalizeName(cam);
  const byName = cameras.filter(camera => {
    const name = normalizeName(hass.states[camera]?.attributes?.friendly_name || camera.split('.')[1]);
    return name === wanted || name.startsWith(`${wanted} `);
  });
  const pick = list => list.find(camera => !/(^|[ _.])sub($|[ _])/.test(camera)) || list[0];
  return pick(onDevice) || pick(byName) || null;
}

// One automation saves the latest snapshot for every linked sensor, overwriting the previous one.
export function snapshotAutomation(sensors) {
  const byCamera = new Map();
  for (const sensor of sensors) if (sensor.camera) byCamera.set(sensor.camera, [...(byCamera.get(sensor.camera) || []), sensor.entity_id]);
  return {
    alias: 'DwellDeck · Detection snapshots',
    description: 'Created by DwellDeck. When a human or vehicle detection sensor turns on, saves a snapshot from its camera, replacing the previous one.',
    mode: 'parallel', max: 25,
    triggers: [...byCamera].map(([camera, ids]) => ({trigger: 'state', entity_id: ids, to: 'on', id: camera})),
    conditions: [],
    actions: [{action: 'camera.snapshot', target: {entity_id: '{{ trigger.id }}'}, data: {filename: `${SNAPSHOT_DIR}/{{ trigger.entity_id }}.jpg`}}]
  };
}

const POPUP_STYLES = [{style: 'all', styles: 'ha-dialog, ha-adaptive-dialog { --ha-dialog-surface-background: #101c2b; --ha-dialog-border-radius: 20px; --mdc-theme-surface: #101c2b; --mdc-dialog-scrim-color: rgba(3, 8, 16, 0.76); --card-background-color: #162536; --ha-card-background: #162536; --primary-background-color: #101c2b; --secondary-background-color: #1b2d40; --primary-text-color: #edf5ff; --secondary-text-color: #91a8bd; --primary-color: #29d5ee; --accent-color: #39e2bc; --divider-color: rgba(156, 199, 225, 0.12); color: #edf5ff; } .title { color: #edf5ff; font-weight: 600; } .content { color: #edf5ff; }'}];
// A missing snapshot (no detection yet) shows a placeholder behind the image instead of a broken
// image; a real snapshot covers it. Pictures are capped so the popup stays readable.
const NO_SNAPSHOT = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="60"><text x="160" y="36" fill="#91a8bd" font-family="sans-serif" font-size="16" text-anchor="middle">No snapshot yet</text></svg>')}")`;
const SNAPSHOT_IMG = `img { display: block; width: 100%; max-height: 40vh; min-height: 72px; object-fit: contain; color: transparent; background: #0b141f ${NO_SNAPSHOT} center / 320px 60px no-repeat; }`;
// Newer Home Assistant puts the img directly in the card; older versions wrap it in hui-image.
const SNAPSHOT_STYLE = {style: {
  '.': `ha-card { overflow: hidden; border-radius: 16px; } ${SNAPSHOT_IMG}`,
  'hui-image$': SNAPSHOT_IMG
}};
const KIND_LABEL = {human: '🧍 Human', vehicle: '🚗 Vehicle'};

// Clock times, not "minutes ago": button-card only re-renders when these sensors change.
const tileLabel = rows => `[[[
  const rows = ${JSON.stringify(rows)};
  const when = t => { const d = new Date(t), now = new Date(); const time = d.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
    return d.toDateString() === now.toDateString() ? time : d.toLocaleDateString([], {day: 'numeric', month: 'short'}) + ', ' + time; };
  const part = (kind, label) => {
    const found = rows.filter(r => r.kind === kind).map(r => states[r.id]).filter(Boolean)
      .sort((a, b) => new Date(b.last_changed) - new Date(a.last_changed));
    if (!found.length) return '';
    if (found.some(s => s.state === 'on')) return label + ' · <b>Detected now</b>';
    const ok = found.filter(s => !['unavailable', 'unknown'].includes(s.state));
    return ok.length ? label + ' · Clear since ' + when(ok[0].last_changed) : label + ' · Unavailable';
  };
  return ${JSON.stringify(['human', 'vehicle'])}.map(kind => part(kind, ${JSON.stringify(KIND_LABEL)}[kind])).filter(Boolean).join('<br>');
]]]`;

const activeTest = ids => `${JSON.stringify(ids)}.some(id => states[id]?.state === 'on')`;

function detectionTile(group, snapshots) {
  const ids = group.sensors.map(sensor => sensor.entity_id);
  const rows = group.sensors.flatMap(sensor => sensor.kinds.map(kind => ({id: sensor.entity_id, kind})));
  const cards = [];
  for (const kind of ['human', 'vehicle']) for (const sensor of group.sensors.filter(s => s.kinds.includes(kind))) {
    const header = `{% set s = states.${sensor.entity_id} %}#### ${KIND_LABEL[kind]} · {% if not s %}not found{% elif s.state == 'on' %}detected now{% elif s.state in ['unavailable', 'unknown'] %}unavailable{% else %}clear since {{ as_timestamp(s.last_changed) | timestamp_custom('%d %b, %H:%M') }}{% endif %}`;
    cards.push({type: 'markdown', content: snapshots
      ? `${header}\n\nLatest snapshot from *{{ state_attr('${sensor.entity_id}', 'friendly_name') }}*.`
      : header});
    if (snapshots && sensor.camera) cards.push({type: 'picture', image: snapshotImage(sensor.entity_id), tap_action: {action: 'none'}, hold_action: {action: 'none'}, card_mod: SNAPSHOT_STYLE});
  }
  if (!snapshots) cards.push({type: 'markdown', content: 'To see a picture of each detection, open **Edit dashboard** and press **Set up detection snapshots**.'});
  if (group.camera) cards.push({type: 'markdown', content: '#### 📹 Live view'},
    {type: 'picture-entity', entity: group.camera, camera_view: 'auto', show_name: false, show_state: false, tap_action: {action: 'more-info'}});
  else cards.push({type: 'markdown', content: '_No camera is linked to these sensors, so there is no picture. Put them on the camera’s device, or name the camera like the sensors._'});
  return {
    type: 'custom:button-card', name: group.cam, icon: 'mdi:cctv', show_label: true, show_state: false,
    triggers_update: ids, label: tileLabel(rows), variables: {dwell_rows: rows},
    tap_action: {action: 'fire-dom-event', browser_mod: {service: 'browser_mod.popup', data: {
      title: `${group.cam} | Detection`, initial_style: 'wide', content: {type: 'vertical-stack', cards}, popup_styles: POPUP_STYLES}}},
    grid_options: {columns: 6, rows: 'auto'},
    styles: {
      grid: [{'grid-template-areas': '"i n" "i l"'}, {'grid-template-columns': '40px 1fr'}, {'grid-template-rows': 'min-content 1fr'}],
      card: [{padding: '14px 16px'}, {'min-height': '96px'}, {'border-radius': '16px'}, {'text-align': 'left'}, {background: 'linear-gradient(135deg, #1b2d40, #101c2b)'},
        {border: `[[[ return ${activeTest(ids)} ? '1px solid #ffd16b' : '1px solid rgba(156,199,225,.12)'; ]]]`},
        {'box-shadow': `[[[ return ${activeTest(ids)} ? '0 0 22px rgba(255,209,107,.28)' : 'none'; ]]]`}],
      icon: [{width: '28px'}, {color: `[[[ return ${activeTest(ids)} ? '#ffd16b' : '#91b4ce'; ]]]`}],
      name: [{'justify-self': 'start'}, {'font-weight': '600'}, {color: '#edf5ff'}],
      label: [{'justify-self': 'start'}, {'text-align': 'left'}, {'font-size': '13px'}, {'line-height': '1.5'}, {color: '#91a8bd'}, {'white-space': 'normal'}]
    }
  };
}

// One tile per camera, ordered as when the dashboard loads: active detections first,
// then most recent change, then cameras whose sensors are all unavailable.
function detectionTiles(hass, snapshots) {
  const groups = new Map();
  for (const sensor of detectionSensors(hass)) {
    const group = groups.get(sensor.cam) || {cam: sensor.cam, sensors: [], camera: null};
    group.sensors.push(sensor); group.camera ||= sensor.camera; groups.set(sensor.cam, group);
  }
  const rank = group => {
    const sensors = group.sensors.map(sensor => hass.states[sensor.entity_id]);
    if (sensors.some(s => s.state === 'on')) return 0;
    return sensors.every(s => ['unavailable', 'unknown'].includes(s.state)) ? 2 : 1;
  };
  const latest = group => Math.max(...group.sensors.map(sensor => Date.parse(hass.states[sensor.entity_id].last_changed) || 0));
  return [...groups.values()].sort((a, b) => rank(a) - rank(b) || latest(b) - latest(a)).map(group => detectionTile(group, snapshots));
}

// Media browser page of the snapshot folder (media/dwelldeck/snapshots).
export const SNAPSHOT_BROWSER = '/media-browser/browser/' + encodeURIComponent(['app', 'media-source://media_source', 'media-source://media_source/local/dwelldeck/snapshots'].join(','));

// Runs inside a button-card template: one folding list of cameras, newest detection first. It is folded
// by default and remembers being open on this device. Each row opens the camera's detection popup.
// Self-contained: serialised with toString.
function dwellDetections(states, cfg) {
  const store = (() => { try { return window.localStorage; } catch (e) { return null; } })();
  const open = store?.getItem('dwelldeck-detections-open') === '1';
  window.__dwellDet = window.__dwellDet || {};
  const esc = v => String(v).replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
  const when = t => { const d = new Date(t), now = new Date(); const time = d.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
    return d.toDateString() === now.toDateString() ? time : d.toLocaleDateString([], {day: 'numeric', month: 'short'}) + ', ' + time; };
  const groups = cfg.groups.map((g, i) => {
    window.__dwellDet['g' + i] = g.popup;
    const found = g.rows.map(r => ({...r, s: states[r.id]})).filter(r => r.s);
    const live = found.filter(r => !['unavailable', 'unknown'].includes(r.s.state));
    const now = [...new Set(live.filter(r => r.s.state === 'on').map(r => r.kind))];
    const latest = Math.max(0, ...live.map(r => Date.parse(r.s.last_changed) || 0));
    const latestKind = live.slice().sort((a, b) => Date.parse(b.s.last_changed) - Date.parse(a.s.last_changed))[0]?.kind;
    return {key: 'g' + i, cam: g.cam, now, latest, latestKind, offline: !live.length};
  }).sort((a, b) => (b.now.length > 0) - (a.now.length > 0) || a.offline - b.offline || b.latest - a.latest);
  const icon = kind => kind === 'vehicle' ? 'mdi:car' : 'mdi:account';
  const active = groups.filter(g => g.now.length);
  const last = groups.find(g => !g.offline && g.latest);
  const summary = active.length ? 'Detected now: ' + active.map(g => esc(g.cam)).join(', ')
    : last ? 'Latest: ' + esc(last.cam) + ', ' + when(last.latest) : 'No detections yet';
  // Clicks go through small helpers on window, like the TV panel: inline handlers stay short and quote-free.
  window.__dwellDetUi = window.__dwellDetUi || {
    toggle(el) {
      const box = el.closest('.det');
      const open = !box.classList.contains('open');
      box.classList.toggle('open', open);
      el.setAttribute('aria-expanded', open ? 'true' : 'false');
      try { window.localStorage.setItem('dwelldeck-detections-open', open ? '1' : '0'); } catch (e) { /* private mode */ }
    },
    popup(el) {
      const action = window.__dwellDet?.[el.dataset.key];
      if (action) el.dispatchEvent(new CustomEvent('ll-custom', {detail: {browser_mod: action}, bubbles: true, composed: true}));
    },
    go(el) { history.pushState(null, '', el.dataset.path); window.dispatchEvent(new CustomEvent('location-changed')); }
  };
  const toggle = 'event.stopPropagation();window.__dwellDetUi.toggle(this)';
  const popup = key => `event.stopPropagation();window.__dwellDetUi.popup(this)" data-key="${key}`;
  const go = path => `event.stopPropagation();window.__dwellDetUi.go(this)" data-path="${path}`;
  const row = g => `<button class="row${g.now.length ? ' now' : ''}" onclick="${popup(g.key)}">
    <ha-icon icon="${g.now.length ? icon(g.now[0]) : g.offline ? 'mdi:video-off' : g.latestKind ? icon(g.latestKind) : 'mdi:cctv'}"></ha-icon><span class="nm">${esc(g.cam)}</span>
    <span class="st">${g.now.length ? 'Detected now' : g.offline ? 'Unavailable' : g.latest ? when(g.latest) : '—'}</span></button>`;
  return `<style>
    .det{display:grid;gap:10px;text-align:left}
    .det ha-icon{--mdc-icon-size:20px;width:20px;height:20px;display:block}
    .ic ha-icon{--mdc-icon-size:22px;width:22px;height:22px}
    .head{all:unset;box-sizing:border-box;display:grid;grid-template-columns:40px minmax(0,1fr) auto;align-items:center;gap:12px;cursor:pointer;width:100%}
    .ic{display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:rgba(0,0,0,.18);color:${active.length ? cfg.c.onText : cfg.c.muted}}
    .t{font-size:15px;font-weight:600;color:${cfg.c.text}}
    .sum{font-size:13px;color:${active.length ? cfg.c.onText : cfg.c.muted};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .chev{display:flex;align-items:center;gap:4px;font-size:13px;color:${cfg.c.muted}}
    .chev ha-icon{transition:transform .2s ease}
    .det.open .chev ha-icon{transform:rotate(180deg)}
    .list{display:none;gap:4px}
    .det.open .list{display:grid}
    .row,.snap{all:unset;box-sizing:border-box;display:grid;grid-template-columns:22px minmax(0,1fr) auto;align-items:center;gap:10px;min-height:44px;padding:0 12px;
      border-radius:12px;background:rgba(0,0,0,.18);cursor:pointer;font-size:14px;color:${cfg.c.text}}
    .row ha-icon{--mdc-icon-size:20px;color:${cfg.c.muted}}
    .row.now{border:1px solid ${cfg.c.on};background:rgba(213,167,76,.12)}
    .row.now ha-icon,.row.now .st{color:${cfg.c.onText};font-weight:600}
    .nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .st{color:${cfg.c.muted};font-size:13px;font-variant-numeric:tabular-nums}
    .snap{grid-template-columns:22px 1fr;color:${cfg.c.muted}}
    .head:focus-visible,.row:focus-visible,.snap:focus-visible{outline:2px solid ${cfg.c.onText};outline-offset:2px}
    @media (prefers-reduced-motion:reduce){.chev ha-icon{transition:none}}
  </style>
  <div class="det${open ? ' open' : ''}">
    <button class="head" onclick="${toggle}" aria-expanded="${open ? 'true' : 'false'}" aria-label="Show or hide cameras"><span class="ic"><ha-icon icon="mdi:cctv"></ha-icon></span>
      <span style="min-width:0"><div class="t">${groups.length} cameras with detection</div><div class="sum">${summary}</div></span>
      <span class="chev"><ha-icon icon="mdi:chevron-down"></ha-icon></span></button>
    <div class="list">${groups.map(row).join('')}
      <button class="snap" onclick="${go(cfg.snapshots)}"><ha-icon icon="mdi:image-multiple-outline"></ha-icon><span>Open all detection snapshots</span></button></div>
  </div>`;
}

function detectionPanel(tiles, snapshotsPath) {
  const groups = tiles.map(tile => ({cam: tile.name, rows: tile.variables.dwell_rows, popup: tile.tap_action.browser_mod}));
  return {
    type: 'custom:button-card', show_name: false, show_icon: false, show_state: false, show_label: false,
    tap_action: {action: 'none'}, hold_action: {action: 'none'}, variables: {dwell_static: true, dwell_groups: groups},
    triggers_update: [...new Set(groups.flatMap(group => group.rows.map(row => row.id)))],
    custom_fields: {list: `[[[ return (${dwellDetections.toString()})(states, ${JSON.stringify({groups, snapshots: snapshotsPath, c: {text: '#edf5ff', muted: '#91a8bd', on: '#d5a74c', onText: '#efc875'}})}); ]]]`},
    styles: {
      card: [{padding: '12px'}, {'border-radius': '20px'}, {background: 'linear-gradient(135deg, #1b2d40, #101c2b)'}, {border: '1px solid rgba(156,199,225,.12)'}, {'box-shadow': 'none'}, {cursor: 'default'}],
      grid: [{'grid-template-areas': '"list"'}, {'grid-template-columns': '1fr'}],
      custom_fields: {list: [{width: '100%'}]}
    },
    grid_options: {columns: 'full', rows: 'auto'}
  };
}

export function cameraDetectionSection(prefix, config = {}, hass = {}) {
  const tiles = detectionTiles(hass, config.detection_snapshots === true);
  // With detection sensors: one folding list, newest first. Without: the status and recent-activity summaries.
  return {type: 'grid', column_span: 2, cards: [
    {type: 'heading', heading: 'Camera detection', icon: 'mdi:cctv'},
    ...(tiles.length ? [detectionPanel(tiles, SNAPSHOT_BROWSER)] : [
      {type: 'markdown', content: STATUS, grid_options: {columns: 12, rows: 'auto'}, card_mod: detectionStyle()},
      {type: 'markdown', content: RECENT, grid_options: {columns: 12, rows: 'auto'}, card_mod: detectionStyle()}]),
    {type: 'button', name: 'Detection snapshots', icon: 'mdi:image-multiple-outline', icon_height: '30px', show_state: false,
      tap_action: {action: 'navigate', navigation_path: SNAPSHOT_BROWSER}, grid_options: {columns: 6, rows: 2}},
    {type: 'button', name: 'Detection history', icon: 'mdi:history', icon_height: '30px', show_state: false,
      tap_action: {action: 'navigate', navigation_path: `${prefix}/notifications`}, grid_options: {columns: 6, rows: 2},
      card_mod: {style: 'ha-card { background: linear-gradient(135deg, #1b2d40, #101c2b); border: 1px solid rgba(156,199,225,.12); border-radius: 16px; --primary-text-color: #edf5ff; --secondary-text-color: #91a8bd; }'}}
  ]};
}
