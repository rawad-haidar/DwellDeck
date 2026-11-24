// One compact card per TV: what's on, power, volume and playback, and tabs that open in place:
// Remote, Apps, Sources and Keyboard. No popups, so a TV inside a room popup keeps the room open
// (Browser Mod shows one popup at a time).

import {normalizeName} from './util.mjs';
import {entityArea} from './discovery.mjs';

// Key names per control method.
export const TV_REMOTES = {
  // Android TV Remote integration: remote.send_command on the TV's remote entity.
  androidtv_remote: {up: 'DPAD_UP', down: 'DPAD_DOWN', left: 'DPAD_LEFT', right: 'DPAD_RIGHT', ok: 'DPAD_CENTER',
    back: 'BACK', home: 'HOME', menu: 'MENU', mute: 'MUTE', keyboard: true},
  // Apple TV integration: remote.send_command on the Apple TV's remote entity.
  apple_tv: {up: 'up', down: 'down', left: 'left', right: 'right', ok: 'select', back: 'menu', home: 'home', menu: 'top_menu'},
  // Android Debug Bridge integration: androidtv.adb_command on the media player itself.
  androidtv: {up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT', ok: 'CENTER', back: 'BACK', home: 'HOME', menu: 'MENU', mute: 'MUTE'}
};

// How to send remote keys to this player: ADB on the player itself, or a remote entity of a supported
// integration on the same device, or else in the same area with the same base name ("Saloon TV").
const remoteControl = entry => ({id: entry.entity_id, platform: entry.platform, commands: TV_REMOTES[entry.platform],
  send: (command, extra = {}) => ({action: 'perform-action', perform_action: 'remote.send_command', target: {entity_id: entry.entity_id}, data: {command, ...extra}})});
// A remote's key set: by integration, or by what it reports (a remote that reports the current app is
// an Android TV remote, whatever integration provides it).
const remoteKind = (entry, hass) => {
  if (TV_REMOTES[entry.platform]) return entry.platform;
  const attributes = hass.states?.[entry.entity_id]?.attributes || {};
  return 'current_activity' in attributes || 'activity_list' in attributes ? 'androidtv_remote' : null;
};
export function tvRemote(id, hass) {
  const own = hass.entities?.[id];
  if (own?.platform === 'androidtv') {
    return {id, platform: 'androidtv', commands: TV_REMOTES.androidtv,
      send: command => ({action: 'perform-action', perform_action: 'androidtv.adb_command', target: {entity_id: id}, data: {command}})};
  }
  const remotes = Object.keys(hass.entities || hass.states || {}).filter(other => other.startsWith('remote.'))
    .map(other => hass.entities?.[other] || {entity_id: other})
    .filter(entry => !entry.disabled_by && entry.platform !== 'androidtv' && remoteKind(entry, hass));
  const sameDevice = own?.device_id && remotes.find(entry => entry.device_id === own.device_id);
  const sameName = remotes.find(entry => entityArea(entry.entity_id, hass) === entityArea(id, hass) && baseName(entry.entity_id, hass) === baseName(id, hass));
  const remote = sameDevice || sameName;
  if (!remote) return null;
  const kind = remoteKind(remote, hass);
  return {...remoteControl(remote), platform: kind, commands: TV_REMOTES[kind]};
}

// One TV can appear through several integrations ("Saloon TV" and "Saloon TV ADB").
// Players in the same area with the same base name become one card; the best-controlled one leads.
const playerName = (id, hass) => hass.states?.[id]?.attributes?.friendly_name || hass.entities?.[id]?.name || hass.entities?.[id]?.original_name || id.split('.')[1].replaceAll('_', ' ');
// "Saloon TV(192.168.14.187) Saloon TV(192.168.14.246)", "Saloon TV ADB" and "Saloon TV" all become "saloon tv".
export const baseName = (id, hass) => {
  const words = normalizeName(playerName(id, hass).replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, ' '))
    .split(' ').filter(word => word && !/^(adb|remote|cast|chromecast|\d+)$/.test(word));
  return [...new Set(words)].join(' ');
};
// The TV's own integration leads (Android TV Remote, Apple TV), then ADB, then other TVs, then speakers.
const rank = (id, hass) => {
  const platform = hass.entities?.[id]?.platform;
  if (platform === 'androidtv') return 3;
  const tv = hass.states?.[id]?.attributes?.device_class === 'tv';
  if (['androidtv_remote', 'apple_tv'].includes(platform) || tv) return tvRemote(id, hass) ? 0 : 1;
  return tvRemote(id, hass) ? 2 : 4;
};

// media_player supported_features bits.
const FEATURE = {pause: 1, volumeSet: 4, turnOn: 128, turnOff: 256, volumeStep: 1024, play: 16384};
const supports = (id, hass, bits) => (Number(hass.states?.[id]?.attributes?.supported_features) & bits) !== 0;
// The first entry of the TV (lead first) that supports an action, so each button reaches an entry that can do it.
const playerFor = (players, hass, bits) => players.find(id => supports(id, hass, bits));
// Hidden entries still join their TV (a hidden "Saloon TV" can lead the card); disabled ones and
// entries without a state do not.
export function tvGroup(id, hass) {
  const base = baseName(id, hass);
  const area = entityArea(id, hass);
  const players = [...new Set([...Object.keys(hass.entities || {}), ...Object.keys(hass.states || {})])]
    .filter(other => other.startsWith('media_player.') && hass.states?.[other] && !hass.entities?.[other]?.disabled_by);
  const peers = base ? players.filter(other => other !== id && entityArea(other, hass) === area && baseName(other, hass) === base) : [];
  return [id, ...peers].sort((a, b) => rank(a, hass) - rank(b, hass) || a.localeCompare(b));
}
// One card per TV: keeps the first entry of each TV in the list and drops the rest.
export const withoutDuplicatePlayers = (ids, hass) => {
  const seen = new Set();
  return ids.filter(id => {
    if (!id.startsWith('media_player.')) return true;
    const lead = tvGroup(id, hass)[0];
    if (seen.has(lead)) return false;
    seen.add(lead);
    return true;
  });
};

// Friendly names for common Android TV packages; other package names are system services and are hidden.
const KNOWN_PACKAGES = {
  'com.netflix.ninja': 'Netflix', 'com.google.android.youtube.tv': 'YouTube', 'com.google.android.youtube.tvmusic': 'YouTube Music',
  'com.disney.disneyplus': 'Disney+', 'com.amazon.amazonvideo.livingroom': 'Prime Video', 'com.spotify.tv.android': 'Spotify',
  'net.mbc.shahid.androidtv': 'Shahid', 'net.mbc.shahidtv': 'Shahid', 'com.tod.tv': 'TOD', 'com.bein.tod': 'TOD',
  'com.apple.atve.androidtv.appletv': 'Apple TV', 'com.plexapp.android': 'Plex', 'org.xbmc.kodi': 'Kodi',
  'com.google.android.tvlauncher': 'Home', 'com.google.android.apps.tv.launcherx': 'Home', 'com.android.tv.settings': 'Settings',
  'com.google.android.apps.mediashell': 'Google Cast', 'com.android.vending': 'Play Store', 'io.homeassistant.companion.android': 'Home Assistant', 'com.anghami.tv': 'Anghami', 'com.google.android.videos': 'Google TV', 'tv.twitch.android.app': 'Twitch'
};
// Asks ADB for the TV apps that can be launched from the home screen, and for user-installed apps.
const FETCH_APPS = 'cmd package query-activities --brief -a android.intent.action.MAIN -c android.intent.category.LEANBACK_LAUNCHER; pm list packages -3';
// Launchers, setup and system services are not apps to open.
const HIDDEN_PACKAGES = /launcher|setupwraith|tungsten|katniss|systemui|inputmethod|\.gms|gsf|tvrecommendations|backdrop|dreamx|remote\.service|mediatek|providers|permissioncontroller|\.tts$|tokenmanager|airplay|tclhome|\.ext\.services/;
// Shown when the TV lists no apps: common apps, opened by their package with Android TV Remote.
const COMMON_APPS = [['Netflix', 'com.netflix.ninja'], ['YouTube', 'com.google.android.youtube.tv'], ['Disney+', 'com.disney.disneyplus'],
  ['Prime Video', 'com.amazon.amazonvideo.livingroom'], ['Spotify', 'com.spotify.tv.android'], ['YouTube Music', 'com.google.android.youtube.tvmusic']];
// Shown when the TV lists no inputs: Android input keys. Whether a TV follows them depends on the TV.
const COMMON_INPUTS = [['Home', 'HOME'], ['HDMI 1', 'TV_INPUT_HDMI_1'], ['HDMI 2', 'TV_INPUT_HDMI_2'], ['HDMI 3', 'TV_INPUT_HDMI_3'], ['HDMI 4', 'TV_INPUT_HDMI_4'], ['Inputs', 'TV_INPUT']];
const SOURCE_PATTERN = /hdmi|^tv$|live ?tv|antenna|tuner|^av\b|composite|component|usb|launcher|^home$/i;
// App icons: Material Design brand icons (built into Home Assistant, so nothing is downloaded) on the
// app's brand colour. Inputs use a neutral icon. Apps not listed get a letter tile (see dwellTvPanel).
const APP_ICONS = [
  [/youtube ?music|tvmusic/i, 'mdi:music-circle', '#ff0000'], [/youtube ?kids/i, 'mdi:youtube', '#ff4e45'],
  [/youtube/i, 'mdi:youtube', '#ff0000'], [/netflix/i, 'mdi:netflix', '#e50914'], [/spotify/i, 'mdi:spotify', '#1db954'],
  [/twitch/i, 'mdi:twitch', '#9146ff'], [/plex/i, 'mdi:plex', '#e5a00d'], [/kodi/i, 'mdi:kodi', '#17b2e7'],
  [/apple ?tv|tv\+/i, 'mdi:apple', '#3a3a3c'], [/apple ?music/i, 'mdi:apple', '#fa2d48'], [/play ?store|vending/i, 'mdi:google-play', '#01875f'],
  [/disney/i, 'mdi:movie-open-star-outline', '#113ccf'], [/prime|amazon/i, 'mdi:movie-play-outline', '#00a8e1'],
  [/hulu/i, 'mdi:hulu', '#1ce783'], [/vlc/i, 'mdi:vlc', '#ff8800'], [/emby/i, 'mdi:emby', '#52b54b'], [/jellyfin/i, 'mdi:jellyfish', '#aa5cc3'],
  [/steam/i, 'mdi:steam', '#1b2838'], [/chrome|browser/i, 'mdi:google-chrome', '#4285f4'], [/firefox/i, 'mdi:firefox', '#ff7139'],
  [/facebook/i, 'mdi:facebook', '#1877f2'], [/instagram/i, 'mdi:instagram', '#e1306c'], [/whatsapp/i, 'mdi:whatsapp', '#25d366'],
  [/vimeo/i, 'mdi:vimeo', '#1ab7ea'], [/^tod$|bein/i, 'mdi:soccer', '#5b2c83'], [/playstation/i, 'mdi:sony-playstation', '#003791'],
  [/xbox/i, 'mdi:microsoft-xbox', '#107c10'], [/home ?assistant/i, 'mdi:home-assistant', '#18bcf2'], [/cast/i, 'mdi:cast', '#4285f4'],
  [/google ?tv/i, 'mdi:television-play', '#4285f4'], [/settings/i, 'mdi:cog', '#5f6b7a'], [/podcast/i, 'mdi:podcast', '#8e44ad'],
  [/music/i, 'mdi:music-note', '#e0533d'], [/weather/i, 'mdi:weather-partly-cloudy', '#2d8cf0'], [/news/i, 'mdi:newspaper', '#5f6b7a'],
  [/hdmi/i, 'mdi:video-input-hdmi'], [/launcher|^home$/i, 'mdi:home-outline'], [/^(tv|live ?tv|antenna|tuner)$/i, 'mdi:television-classic'],
  [/usb/i, 'mdi:usb'], [/^inputs$/i, 'mdi:import']];

// A readable name for a list entry, or null for package names that are system services.
export function appName(entry) {
  const text = String(entry || '').trim();
  if (!text) return null;
  if (KNOWN_PACKAGES[text]) return KNOWN_PACKAGES[text];
  if (/launcher/i.test(text)) return 'Home';
  if (/^[a-z][\w]*(\.[\w:]+)+$/i.test(text)) return null;
  return text;
}

const C = {
  surface: '#1b2d40', surfaceEnd: '#172638', card: '#101c2b', text: '#edf5ff', muted: '#91a8bd',
  line: 'rgba(156,199,225,.12)', onBg: '#493b24', on: '#d5a74c', onText: '#efc875'
};
const OFF = "['off','standby','unavailable','unknown']";

// A key. Labelled keys stack icon over name; round keys are bare icons for the pad.
function key(name, icon, tap, {hold, label = false, round = false, size = 22, height = 48} = {}) {
  return {
    type: 'custom:button-card', name, icon, show_name: label, show_state: false,
    tap_action: tap, hold_action: hold || {action: 'none'},
    styles: {
      card: [{background: round ? 'transparent' : `linear-gradient(135deg,${C.surface},${C.surfaceEnd})`},
        {border: round ? 'none' : `1px solid ${C.line}`}, {'border-radius': round ? '50%' : '12px'},
        {'box-shadow': 'none'}, {padding: label ? '10px 4px 8px' : '0'}, {'min-height': `${height}px`}],
      icon: [{width: `${size}px`}, {color: C.text}],
      name: [{'font-size': '13px'}, {color: C.text}, {'margin-top': '4px'}, {'white-space': 'nowrap'}, {overflow: 'hidden'}, {'text-overflow': 'ellipsis'}, {'max-width': '100%'}]
    }
  };
}
// A button-card used only to lay out nested cards on a grid.
function group(areas, columns, fields, extra = {}) {
  return {
    type: 'custom:button-card', show_name: false, show_icon: false, show_state: false, tap_action: {action: 'none'}, hold_action: {action: 'none'},
    styles: {
      card: [{background: 'transparent'}, {border: 'none'}, {'box-shadow': 'none'}, {padding: '0'}, {overflow: 'visible'}, ...(extra.card || [])],
      grid: [{'grid-template-areas': areas}, {'grid-template-columns': columns}, {gap: '10px'}, ...(extra.grid || [])],
      custom_fields: Object.fromEntries(Object.keys(fields).map(k => [k, [{width: '100%'}, {'min-width': '0'}]]))
    },
    custom_fields: Object.fromEntries(Object.entries(fields).map(([k, card]) => [k, {card}]))
  };
}
// The tabs panel. Runs inside a button-card template, so it must be self-contained (serialised with toString).
// Tabs open and close in the page without a Home Assistant state, and each key calls a Home Assistant action.
function dwellTvPanel(states, cfg) {
  window.__dwellTv = window.__dwellTv || {
    hass: () => document.querySelector('home-assistant')?.hass,
    call(el) { const [domain, service, data] = JSON.parse(el.dataset.call); this.hass()?.callService(domain, service, data); },
    // The open tab is kept per TV, so a redraw of the card keeps it open.
    open: {},
    fetched: {},
    tab(el) {
      const box = el.closest('.dw-tv');
      const next = box.dataset.open === el.dataset.tab ? '' : el.dataset.tab;
      box.dataset.open = next;
      this.open[box.dataset.tv] = next;
      // Opening Apps asks ADB for the installed apps, at most once a minute per TV.
      if (next && el.dataset.fetch && Date.now() - (this.fetched[box.dataset.tv] || 0) > 60000) {
        this.fetched[box.dataset.tv] = Date.now();
        const [domain, service, data] = JSON.parse(el.dataset.fetch);
        this.hass()?.callService(domain, service, data);
      }
    },
    send(el) {
      const input = el.closest('.dw-kb').querySelector('input');
      const text = input.value;
      if (!text) return;
      const [domain, service, data] = JSON.parse(el.dataset.call);
      this.hass()?.callService(domain, service, {...data, command: text});
      input.value = '';
    }
  };
  const c = cfg.c;
  const esc = value => String(value).replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
  const call = (domain, service, data) => esc(JSON.stringify([domain, service, data]));
  const keyCall = command => cfg.remote ? call(cfg.remote.domain, cfg.remote.service, {entity_id: cfg.remote.target, command}) : '';
  const player = service => call('media_player', service, {entity_id: cfg.lead});
  const btn = (icon, label, callData, cls = 'key', showLabel = true) =>
    `<button class="${cls}" aria-label="${esc(label)}" onclick="window.__dwellTv.call(this)" data-call="${callData}"><ha-icon icon="${icon}"></ha-icon>${showLabel ? `<span>${esc(label)}</span>` : ''}</button>`;

  // Apps and inputs from the TV's current lists.
  const nameOf = raw => {
    const text = String(raw || '').trim();
    if (!text) return null;
    if (cfg.known[text]) return cfg.known[text];
    if (/launcher/i.test(text)) return 'Home';
    if (/^[a-z][\w]*(\.[\w:]+)+$/i.test(text)) return null;
    return text;
  };
  const isInput = new RegExp(cfg.inputPattern, 'i');
  const seen = new Set();
  const items = [];
  const add = (raw, callData) => {
    const name = nameOf(raw);
    if (!name || seen.has(name.toLowerCase())) return;
    seen.add(name.toLowerCase());
    items.push({name, callData, input: isInput.test(name)});
  };
  const prettify = pkg => {
    if (cfg.known[pkg]) return cfg.known[pkg];
    const part = pkg.split(/[.:]/).filter(w => !/^(com|net|org|tv|android|androidtv|google|app|apps|mobile|ninja|livingroom|leanback|atv|player)$/i.test(w)).pop() || pkg;
    return part.charAt(0).toUpperCase() + part.slice(1);
  };
  if (cfg.activities) for (const raw of states[cfg.activities]?.attributes?.activity_list || []) add(raw, call('remote', 'turn_on', {entity_id: cfg.activities, activity: raw}));
  // ADB's source list is the running apps, which change as apps open and close: use it only for inputs.
  for (const p of cfg.players) for (const raw of states[p]?.attributes?.source_list || []) {
    if (p === cfg.adb && !isInput.test(nameOf(raw) || '')) continue;
    add(raw, call('media_player', 'select_source', {entity_id: p, source: raw}));
  }
  const keyCallFor = command => call(cfg.remote.domain, cfg.remote.service, {entity_id: cfg.remote.target, command});
  const fallbackNote = {};

  // Installed apps from ADB. The card asks ADB for the TV's launchable apps; the answer arrives in the
  // ADB player's adb_response. The list is remembered in the browser until a newer answer replaces it,
  // so an app drops out only once it is uninstalled.
  const storeKey = 'dwelldeck-apps-' + cfg.lead;
  const store = (window.__dwellTvApps ||= {});
  if (!(storeKey in store)) {
    store[storeKey] = null;
    try { store[storeKey] = JSON.parse(localStorage.getItem(storeKey) || 'null'); } catch (error) { /* storage unavailable */ }
  }
  const response = cfg.adb ? String(states[cfg.adb]?.attributes?.adb_response || '') : '';
  if (/package:|\//.test(response)) {
    const found = [...new Set(response.split(/\r?\n/).map(line => (line.match(/^\s*(?:package:)?([a-z][\w]*(?:\.[\w]+)+)(?:\/\S*)?\s*$/i) || [])[1]).filter(Boolean))]
      .filter(pkg => !new RegExp(cfg.hiddenPackages, 'i').test(pkg));
    if (found.length && JSON.stringify(found) !== JSON.stringify(store[storeKey])) {
      store[storeKey] = found;
      try { localStorage.setItem(storeKey, JSON.stringify(found)); } catch (error) { /* storage unavailable */ }
    }
  }
  const installed = store[storeKey] || [];
  const launch = pkg => cfg.androidRemote
    ? call('remote', 'turn_on', {entity_id: cfg.androidRemote, activity: pkg})
    : call('androidtv', 'adb_command', {entity_id: cfg.adb, command: `monkey -p ${pkg} -c android.intent.category.LEANBACK_LAUNCHER 1`});
  for (const pkg of installed) {
    const name = prettify(pkg);
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    items.push({name, callData: launch(pkg), input: false});
  }

  // Without an installed list, Android TV Remote TVs get common apps; input keys when the TV lists no inputs.
  if (cfg.fallback) {
    if (!items.some(i => !i.input)) {
      for (const [name, activity] of cfg.fallback.apps) items.push({name, callData: call('remote', 'turn_on', {entity_id: cfg.fallback.remote, activity}), input: false});
      fallbackNote.apps = cfg.adb
        ? 'Common apps. Turn the TV on and press Refresh to load the apps installed on it (needs the ADB connection).'
        : 'Common apps. To list the apps on this TV, add them in the Android TV Remote integration\'s options (Configure, then Applications).';
    }
    if (cfg.remote?.target === cfg.fallback.remote && !items.some(i => i.input)) {
      cfg.fallback.inputs.forEach(([name, command], index) => items.push({name, callData: keyCallFor(command), input: true, order: index}));
      fallbackNote.sources = 'Input keys. Some TVs ignore the HDMI keys; Inputs opens the TV\'s own input menu.';
    }
  } else if (cfg.adb && !installed.length && !items.some(i => !i.input)) {
    fallbackNote.apps = 'Turn the TV on and press Refresh to load the apps installed on it (needs the ADB connection).';
  }
  const byName = (a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name, undefined, {numeric: true});
  const look = name => cfg.icons.find(([pattern]) => new RegExp(pattern, 'i').test(name));
  const icon = name => (look(name) || [0, 'mdi:application-outline'])[1];
  // App tiles: the brand icon on its colour, or the first letter on a colour that stays the same for each app.
  const logo = name => {
    const found = look(name);
    if (found?.[2]) return `<span class="logo" style="background:${found[2]}"><ha-icon icon="${found[1]}"></ha-icon></span>`;
    let hue = 0;
    for (const ch of name) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
    return `<span class="logo" style="background:hsl(${hue},48%,40%)"><b>${esc((name.match(/[\p{L}\p{N}]/u) || ['?'])[0].toUpperCase())}</b></span>`;
  };
  const appBtn = item => `<button class="app" aria-label="${esc(item.name)}" onclick="window.__dwellTv.call(this)" data-call="${item.callData}">${logo(item.name)}<span>${esc(item.name)}</span></button>`;
  const off = cfg.players.every(p => ['off', 'standby', 'unavailable', 'unknown'].includes(states[p]?.state));
  const grid = (list, kind) => list.length
    ? `<div class="apps">${list.sort(byName).map(item => kind === 'apps' ? appBtn(item) : btn(icon(item.name), item.name, item.callData, 'app')).join('')}</div>${fallbackNote[kind] ? `<p class="empty">${fallbackNote[kind]}</p>` : ''}`
    : `<p class="empty">${off ? `Turn the TV on to see its ${kind}.` : kind === 'sources' ? 'This TV doesn\'t list any inputs.' : 'This TV doesn\'t list any apps. For Android TV Remote, add apps in the integration\'s options.'}</p>`;

  const tabs = [];
  const panes = [];
  const tabFetch = {};
  const appsGrid = list => list.length || !cfg.adb ? grid(list, 'apps') : `<p class="empty">${fallbackNote.apps || ''}</p>`;
  if (cfg.remote) {
    const k = cfg.remote.keys;
    tabs.push(['remote', 'mdi:remote-tv', 'Remote']);
    panes.push(`<div class="pane remote">
      <div class="pad">
        ${btn('mdi:chevron-up', 'Up', keyCall(k.up), 'arrow up', false)}
        ${btn('mdi:chevron-left', 'Left', keyCall(k.left), 'arrow left', false)}
        ${btn('mdi:circle-medium', 'OK', keyCall(k.ok), 'ok', false)}
        ${btn('mdi:chevron-right', 'Right', keyCall(k.right), 'arrow right', false)}
        ${btn('mdi:chevron-down', 'Down', keyCall(k.down), 'arrow down', false)}
      </div>
      <div class="row">${btn('mdi:arrow-left', 'Back', keyCall(k.back))}${btn('mdi:home-outline', 'Home', keyCall(k.home))}${btn('mdi:menu', 'Menu', keyCall(k.menu))}${k.mute ? btn('mdi:volume-off', 'Mute', keyCall(k.mute)) : ''}</div>
    </div>`);
  }
  if (cfg.canSwitch) {
    tabs.push(['apps', 'mdi:apps', 'Apps'], ['sources', 'mdi:video-input-hdmi', 'Sources']);
    const fetchCall = cfg.adb ? call('androidtv', 'adb_command', {entity_id: cfg.adb, command: cfg.fetchCommand}) : '';
    const refresh = cfg.adb ? `<button class="refresh" onclick="window.__dwellTv.call(this)" data-call="${fetchCall}"><ha-icon icon="mdi:refresh"></ha-icon><span>Refresh installed apps</span></button>` : '';
    tabFetch.apps = fetchCall;
    panes.push(`<div class="pane apps-pane">${appsGrid(items.filter(i => !i.input))}${refresh}</div>`,
      `<div class="pane sources">${grid(items.filter(i => i.input), 'sources')}</div>`);
  }
  if (cfg.keyboard) {
    tabs.push(['keys', 'mdi:keyboard-outline', 'Keyboard']);
    const sendCall = call(cfg.remote.domain, cfg.remote.service, {entity_id: cfg.remote.target});
    panes.push(`<div class="pane keys"><div class="dw-kb">
      <input type="text" placeholder="Type, then Send" aria-label="Text to type on the TV" onkeydown="if(event.key==='Enter'){event.preventDefault();window.__dwellTv.send(this.nextElementSibling)}">
      <button class="send" onclick="window.__dwellTv.send(this)" data-call="${sendCall}">Send</button></div></div>`);
  }
  if (!tabs.length) return '';
  const paneClass = {remote: 'remote', apps: 'apps-pane', sources: 'sources', keys: 'keys'};
  const open = tabs.map(([name]) => `.dw-tv[data-open="${name}"] .tab[data-tab="${name}"]{background:linear-gradient(135deg,${c.onBg},${c.surfaceEnd});border-color:${c.on}}
    .dw-tv[data-open="${name}"] .pane.${paneClass[name]}{display:grid}`).join('');
  const openTab = window.__dwellTv.open[cfg.lead] || '';
  return `<div class="dw-tv" data-tv="${esc(cfg.lead)}" data-open="${esc(openTab)}">
  <style>
    .dw-tv{display:grid;gap:12px;width:100%;color:${c.text};text-align:left}
    .dw-tv button{all:unset;box-sizing:border-box;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border-radius:12px;
      background:linear-gradient(135deg,${c.surface},${c.surfaceEnd});border:1px solid ${c.line};color:${c.text};font-size:13px;-webkit-tap-highlight-color:transparent}
    .dw-tv button:active{transform:scale(.96)}
    .dw-tv button:focus-visible{outline:2px solid ${c.on};outline-offset:2px}
    .dw-tv ha-icon{--mdc-icon-size:24px}
    .dw-tv .tabs{display:grid;grid-template-columns:repeat(${tabs.length},minmax(0,1fr));gap:10px}
    .dw-tv .tab{min-height:68px;padding:8px 4px}
    .dw-tv .pane{display:none;gap:12px}
    .dw-tv .pad{position:relative;display:grid;grid-template-areas:". up ." "left ok right" ". down .";grid-template-columns:repeat(3,64px);grid-template-rows:repeat(3,64px);
      justify-content:center;align-items:center;justify-items:center;width:220px;height:220px;margin:4px auto 0;border-radius:50%;background:${c.surface}}
    .dw-tv .arrow{width:56px;height:56px;border-radius:50%;background:transparent;border:none}
    .dw-tv .arrow ha-icon{--mdc-icon-size:32px}
    .dw-tv .up{grid-area:up}.dw-tv .down{grid-area:down}.dw-tv .left{grid-area:left}.dw-tv .right{grid-area:right}
    .dw-tv .ok{grid-area:ok;width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,${c.surface},${c.card})}
    .dw-tv .row{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));grid-auto-flow:column;gap:10px}
    .dw-tv .row button{min-height:60px}
    .dw-tv .apps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
    .dw-tv .app{min-height:80px;padding:10px 6px 8px;border-radius:14px}
    .dw-tv .app ha-icon{--mdc-icon-size:30px}
    .dw-tv .app span,.dw-tv .tab span{max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .dw-tv .logo{display:grid;place-items:center;width:46px;height:46px;border-radius:13px;color:#fff;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
    .dw-tv .logo ha-icon{--mdc-icon-size:28px}
    .dw-tv .logo b{font-size:21px;font-weight:700;line-height:1}
    .dw-tv .refresh{flex-direction:row;gap:8px;min-height:44px;margin-top:2px;color:${c.muted}}
    .dw-tv .refresh ha-icon{--mdc-icon-size:20px}
    .dw-tv .empty{margin:6px 4px;color:${c.muted};font-size:14px;line-height:1.5}
    .dw-tv .dw-kb{display:flex;gap:10px}
    .dw-tv input{flex:1;min-width:0;box-sizing:border-box;height:48px;padding:0 14px;border-radius:12px;border:1px solid ${c.line};background:${c.card};color:${c.text};font:inherit;font-size:15px}
    .dw-tv .send{flex:none;min-width:88px;height:48px;font-size:14px;font-weight:600;background:linear-gradient(135deg,${c.onBg},${c.surfaceEnd});border-color:${c.on}}
    ${open}
    @media (prefers-reduced-motion:reduce){.dw-tv button:active{transform:none}}
  </style>
  <div class="tabs">${tabs.map(([name, ic, label]) => `<button class="tab" data-tab="${name}" ${tabFetch[name] ? `data-fetch="${tabFetch[name]}" ` : ''}aria-label="${label}" onclick="window.__dwellTv.tab(this)"><ha-icon icon="${ic}"></ha-icon><span>${label}</span></button>`).join('')}</div>
  ${panes.join('')}
</div>`;
}

export function tvCard(requested, hass) {
  const players = tvGroup(requested, hass);
  const id = players[0];
  const name = playerName(id, hass);
  const remote = players.map(player => tvRemote(player, hass)).find(Boolean);
  const player = (action, target = id) => ({action: 'perform-action', perform_action: `media_player.${action}`, target: {entity_id: target}});
  // Power: an entry that can turn on and off, else the TV remote, else ADB's power key.
  const powerPlayer = playerFor(players, hass, FEATURE.turnOn | FEATURE.turnOff);
  const power = powerPlayer ? player('toggle', powerPlayer)
    : remote && remote.platform !== 'androidtv' ? {action: 'perform-action', perform_action: 'remote.toggle', target: {entity_id: remote.id}}
    : remote ? remote.send('POWER') : player('toggle');
  const volumePlayer = playerFor(players, hass, FEATURE.volumeStep | FEATURE.volumeSet) || id;
  const playPlayer = playerFor(players, hass, FEATURE.play | FEATURE.pause) || id;
  const watched = [...new Set([...players, ...(remote ? [remote.id] : [])])];
  // Status comes from whichever entry is on: the TV's own player first, then anything playing.
  const current = `const OFFS=${OFF}; const known=${JSON.stringify(KNOWN_PACKAGES)};
    const nice = v => { if (!v) return ''; const t = String(v).trim(); if (known[t]) return known[t]; if (/launcher/i.test(t)) return 'Home';
      if (!/^[a-z][\\w]*(\\.[\\w:]+)+$/i.test(t)) return t;
      const part = t.split(/[.:]/).filter(w => !/^(com|net|org|tv|android|androidtv|google|app|apps|mobile|ninja|livingroom|leanback)$/i.test(w)).pop() || t;
      return part.charAt(0).toUpperCase() + part.slice(1); };
    const all=${JSON.stringify(players)}.map(p=>states[p]).filter(Boolean); const live=all.filter(p=>!OFFS.includes(p.state));
    const lead=states[${JSON.stringify(id)}]; const tvs=live.filter(p=>p.attributes?.device_class==='tv');
    const m=(lead && !OFFS.includes(lead.state)) ? lead : tvs[0] || live.find(p=>p.state==='playing') || lead;
    const r=${remote?.id.startsWith('remote.') ? `states[${JSON.stringify(remote.id)}]` : 'undefined'};
    const cur = nice(r && r.state !== 'off' ? r.attributes?.current_activity : '') || live.map(p => nice(p.attributes?.app_name) || nice(p.attributes?.app_id) || p.attributes?.source).find(Boolean) || '';`;
  const canSwitch = remote?.platform === 'androidtv_remote' || players.some(p =>
    (Number(hass.states?.[p]?.attributes?.supported_features) & 2048) || hass.states?.[p]?.attributes?.source_list?.length);
  const cfg = {
    lead: id, players, canSwitch, c: C, known: KNOWN_PACKAGES, inputPattern: SOURCE_PATTERN.source,
    icons: APP_ICONS.map(([pattern, icon, color]) => [pattern.source, icon, color || '']),
    activities: remote?.platform === 'androidtv_remote' ? remote.id : null,
    keyboard: !!remote?.commands?.keyboard,
    fallback: remote?.platform === 'androidtv_remote' ? {remote: remote.id, apps: COMMON_APPS, inputs: COMMON_INPUTS} : null,
    adb: players.find(p => hass.entities?.[p]?.platform === 'androidtv') || null,
    androidRemote: remote?.platform === 'androidtv_remote' ? remote.id : null,
    fetchCommand: FETCH_APPS, hiddenPackages: HIDDEN_PACKAGES.source,
    remote: remote && {
      domain: remote.platform === 'androidtv' ? 'androidtv' : 'remote', service: remote.platform === 'androidtv' ? 'adb_command' : 'send_command',
      target: remote.id, keys: remote.commands
    }
  };

  // One console line per TV, so a setup can be checked from the browser console (F12).
  const logged = typeof window !== 'undefined' ? (window.__dwellTvLogged ||= new Set()) : null;
  if (typeof document !== 'undefined' && typeof console !== 'undefined' && !logged?.has(id) && logged?.add(id)) {
    console.info(`DwellDeck TV "${name}": entries ${players.join(', ')}; remote ${remote ? `${remote.id} (${remote.platform})` : 'none'}; ` +
      `power ${power.perform_action} ${power.target?.entity_id}; volume ${volumePlayer}; play ${playPlayer}`);
  }
  const fields = {
    power: {card: {
      ...key('Power', 'mdi:power', power), entity: powerPlayer || id, triggers_update: [],
      styles: {...key('Power', 'mdi:power').styles, card: [
        {background: `[[[ return ${OFF}.includes(entity?.state) ? 'linear-gradient(135deg,${C.surface},${C.surfaceEnd})' : 'linear-gradient(135deg,${C.onBg},${C.surfaceEnd})'; ]]]`},
        {border: `[[[ return ${OFF}.includes(entity?.state) ? '1px solid ${C.line}' : '1px solid ${C.on}'; ]]]`},
        {'border-radius': '50%'}, {'box-shadow': 'none'}, {width: '46px'}, {height: '46px'}, {padding: '0'}]}
    }},
    media: {card: group('"down play up"', 'repeat(3,1fr)', {
      down: key('Volume down', 'mdi:volume-minus', player('volume_down', volumePlayer)),
      play: key('Play or pause', 'mdi:play-pause', player('media_play_pause', playPlayer)),
      up: key('Volume up', 'mdi:volume-plus', player('volume_up', volumePlayer))
    })}
  };
  // Now playing: status, artwork, title, artist or series, and the app.
  fields.now = `[[[ ${current}
    const esc = v => String(v).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const off = !m || ${OFF}.includes(m.state);
    const playing = m;
    const a = playing?.attributes || {};
    const state = !m ? 'Unavailable' : off ? 'Off' : playing.state === 'playing' ? 'Playing' : playing.state === 'paused' ? 'Paused' : playing.state === 'buffering' ? 'Loading' : 'On';
    const title = a.media_title || '';
    const detail = [a.media_series_title, a.media_artist, a.media_album_name].filter(Boolean).filter((v, i, list) => list.indexOf(v) === i).join(', ');
    const app = cur || a.app_name || '';
    const color = state === 'Playing' ? '${C.onText}' : state === 'Off' || state === 'Unavailable' ? '${C.muted}' : '${C.text}';
    const pill = '<span style="flex:none;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600;color:' + color + ';border:1px solid ' + (state === 'Playing' ? '${C.on}' : '${C.line}') + '">' + state + '</span>';
    if (off || (!title && !app)) return '<div style="display:flex;align-items:center;gap:10px;width:100%;color:${C.muted};font-size:13px;text-align:left">' + pill + '<span>' + (off ? 'The TV is off.' : 'Nothing playing.') + '</span></div>';
    const art = a.entity_picture ? '<div style="flex:none;width:56px;height:56px;border-radius:10px;background:${C.card} url(&quot;' + esc(a.entity_picture) + '&quot;) center/cover"></div>' : '';
    return '<div style="display:flex;align-items:center;gap:12px;width:100%;min-width:0;text-align:left">' + art
      + '<div style="min-width:0;flex:1"><div style="display:flex;align-items:center;gap:8px;min-width:0">' + pill
      + '<span style="font-size:12px;color:${C.muted};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(app) + '</span></div>'
      + (title ? '<div style="margin-top:4px;font-size:15px;font-weight:600;color:${C.text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(title) + '</div>' : '')
      + (detail ? '<div style="font-size:13px;color:${C.muted};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(detail) + '</div>' : '')
      + '</div></div>';
  ]]]`;
  const areas = ['"i n power"', '"i l power"', '"now now now"', '"media media media"'];
  if (remote || canSwitch) {
    fields.panel = `[[[ return (${dwellTvPanel.toString()})(states, ${JSON.stringify(cfg)}); ]]]`;
    areas.push('"panel panel panel"');
  }
  // Header: button-card's own icon, name and label, so it lines up on the left.
  const status = `[[[ ${current}
    const off = !m || ${OFF}.includes(m.state);
    const title = [m?.attributes?.media_title, m?.attributes?.media_artist].filter(Boolean).join(', ');
    return !m ? 'Unavailable' : off ? 'Off' : cur ? 'On, ' + cur : 'On'; ]]]`;
  return {
    type: 'custom:button-card', entity: id, name, icon: 'mdi:television', show_name: true, show_icon: true, show_state: false, show_label: true, label: status,
    tap_action: {action: 'none'}, hold_action: {action: 'more-info'}, triggers_update: watched,
    grid_options: {columns: 12, rows: 'auto'},
    custom_fields: fields,
    styles: {
      card: [{padding: '16px'}, {'border-radius': '20px'}, {border: `1px solid ${C.line}`}, {overflow: 'hidden'},
        {background: `[[[ const p = entity?.attributes?.entity_picture; return entity?.state === 'playing' && p ? 'linear-gradient(180deg,rgba(10,20,32,.72),rgba(10,20,32,.94) 60%),url("' + p + '") center/cover' : 'linear-gradient(160deg,${C.surface},${C.card})'; ]]]`}],
      grid: [{'grid-template-areas': areas.join(' ')}, {'grid-template-columns': '40px minmax(0,1fr) 46px'}, {gap: '2px 12px'}, {'align-items': 'center'}],
      img_cell: [{'justify-content': 'flex-start'}, {width: '40px'}, {height: '40px'}],
      icon: [{width: '28px'}, {color: `[[[ return ${OFF}.includes(entity?.state) ? '${C.muted}' : '${C.onText}'; ]]]`}],
      name: [{'justify-self': 'start'}, {'align-self': 'end'}, {'font-size': '17px'}, {'font-weight': '600'}, {color: C.text}, {'text-align': 'left'}, {'white-space': 'nowrap'}, {overflow: 'hidden'}, {'text-overflow': 'ellipsis'}, {'max-width': '100%'}],
      label: [{'justify-self': 'start'}, {'align-self': 'start'}, {'font-size': '13px'}, {color: C.muted}, {'text-align': 'left'}, {'white-space': 'nowrap'}, {overflow: 'hidden'}, {'text-overflow': 'ellipsis'}, {'max-width': '100%'}],
      custom_fields: {power: [{'justify-self': 'end'}], now: [{'justify-self': 'stretch'}, {'margin-top': '12px'}, {padding: '10px 12px'}, {'border-radius': '14px'}, {background: 'rgba(0,0,0,.18)'}, {border: `1px solid ${C.line}`}], media: [{'justify-self': 'stretch'}, {'margin-top': '14px'}],
        panel: [{'justify-self': 'stretch'}, {'margin-top': '10px'}, {width: '100%'}]}
    }
  };
}
