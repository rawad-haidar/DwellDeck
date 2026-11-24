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
  // A room with exactly one TV remote: that remote belongs to this TV even when the names differ
  // ("Living Tv" and remote.rest_area_living_2f_tv_pro).
  const inArea = remotes.filter(entry => entityArea(entry.entity_id, hass) === entityArea(id, hass));
  const onlyInArea = hass.states?.[id]?.attributes?.device_class === 'tv' && inArea.length === 1 ? inArea[0] : null;
  const remote = sameDevice || sameName || onlyInArea;
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
  // A Music Assistant copy of a zone comes after the zone itself, so power, volume and playback go
  // straight to the device rather than through Music Assistant.
  if (['music_assistant', 'mass'].includes(platform) || 'mass_player_type' in (hass.states?.[id]?.attributes || {})) return 5;
  return tvRemote(id, hass) ? 2 : 4;
};

// TV or sound system. A player says so itself (device_class tv, speaker or receiver), else its integration
// decides, else a TV remote or "TV" in its name. A TV's group counts as a TV when any entry of it is one,
// so a cast entry of a TV stays with the TV.
const TV_PLATFORMS = ['androidtv', 'androidtv_remote', 'apple_tv', 'webostv', 'samsungtv', 'braviatv', 'philips_js', 'vizio', 'roku', 'panasonic_viera', 'lg_netcast', 'lg_thinq', 'hisense_tv', 'tcl'];
const SPEAKER_PLATFORMS = ['music_assistant', 'sonos', 'squeezebox', 'linkplay', 'yamaha_musiccast', 'yamaha', 'denonavr', 'heos', 'bluesound', 'snapcast', 'mpd', 'volumio', 'dsppa', 'bose', 'onkyo', 'frontier_silicon', 'arcam_fmj', 'cambridge_audio', 'russound_rio', 'nad', 'openhome', 'spotify', 'forked_daapd', 'soundtouch', 'harman_kardon_avr', 'anthemav', 'monoprice', 'blackbird', 'xantech', 'dlna_dms'];
// Names you give decide first: "Sound system", "Speaker", "Soundbar" or "Audio" in a name is a sound system.
const SOUND_NAME = /sound\s*system|speaker|sound\s*bar|audio|amplifier|\bamp\b|receiver/i;
const tvEntry = (id, hass) => {
  if (SOUND_NAME.test(`${playerName(id, hass)} ${id.split('.')[1].replaceAll('_', ' ')}`)) return false;
  const dc = hass.states?.[id]?.attributes?.device_class;
  if (dc === 'tv') return true;
  if (dc === 'speaker' || dc === 'receiver') return false;
  const platform = hass.entities?.[id]?.platform;
  if (TV_PLATFORMS.includes(platform)) return true;
  if (SPEAKER_PLATFORMS.includes(platform)) return false;
  if (tvRemote(id, hass)) return true;
  return /\btv\b|television/i.test(`${playerName(id, hass)} ${id.split('.')[1].replaceAll('_', ' ')}`);
};
export const isTv = (id, hass) => tvGroup(id, hass).some(entry => tvEntry(entry, hass));
// What tells whether a TV is on: its real TV entries (device_class tv or a TV integration, not a cast entry
// that happens to be named after it) and its remote. A TV that is on but not playing reports "idle" or "on".
export function tvSignals(id, hass) {
  const group = tvGroup(id, hass);
  const strong = group.filter(entry => !SOUND_NAME.test(playerName(entry, hass)) &&
    (hass.states?.[entry]?.attributes?.device_class === 'tv' || TV_PLATFORMS.includes(hass.entities?.[entry]?.platform)));
  const remote = group.map(entry => tvRemote(entry, hass)).find(Boolean);
  return [...new Set([...(strong.length ? strong : group.slice(0, 1)), ...(remote?.id?.startsWith('remote.') ? [remote.id] : [])])];
}

// media_player supported_features bits.
const FEATURE = {pause: 1, volumeSet: 4, volumeMute: 8, previous: 16, next: 32, turnOn: 128, turnOff: 256, volumeStep: 1024, play: 16384};
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
export const KNOWN_PACKAGES = {
  'music_assistant': 'Music Assistant',
  'com.netflix.ninja': 'Netflix', 'com.google.android.youtube.tv': 'YouTube', 'com.google.android.youtube.tvmusic': 'YouTube Music',
  'com.disney.disneyplus': 'Disney+', 'com.amazon.amazonvideo.livingroom': 'Prime Video', 'com.spotify.tv.android': 'Spotify',
  'net.mbc.shahid.androidtv': 'Shahid', 'net.mbc.shahidtv': 'Shahid', 'com.tod.tv': 'TOD', 'com.bein.tod': 'TOD',
  'com.apple.atve.androidtv.appletv': 'Apple TV', 'com.plexapp.android': 'Plex', 'org.xbmc.kodi': 'Kodi',
  'com.google.android.tvlauncher': 'Home', 'com.google.android.apps.tv.launcherx': 'Home', 'com.android.tv.settings': 'Settings',
  'com.google.android.apps.mediashell': 'Google Cast', 'com.android.vending': 'Play Store',
  'com.todtv.tod': 'TOD', 'com.disneyplus.mea': 'Disney+', 'net.mbc.shahidTV': 'Shahid', 'com.tcl.tv': 'Live TV',
  'com.google.android.play.games': 'Play Games', 'com.iqiyi.i18n.tv': 'iQIYI', 'com.yango.saft.tv': 'Yango Play',
  'com.CV.CablevisionPlus': 'Cablevision Plus', 'com.fadaatmediagroup.live.tv': 'Fadaat Live', 'com.samaitv': 'Samai TV',
  'com.onplus': 'OnPlus', 'com.tcl.ui_mediaCenter': 'Media Center', 'com.tcl.t_solo': 'Listen Alone', 'io.homeassistant.companion.android': 'Home Assistant', 'com.anghami.tv': 'Anghami', 'com.google.android.videos': 'Google TV', 'tv.twitch.android.app': 'Twitch'
};
// Asks ADB for the TV apps that can be launched from the home screen, and for user-installed apps.
const FETCH_APPS = 'cmd package query-activities --brief -a android.intent.action.MAIN -c android.intent.category.LEANBACK_LAUNCHER; pm list packages -3';
// Launchers, setup and system services are not apps to open.
export const HIDDEN_PACKAGES = /launcher|setupwraith|tungsten|katniss|systemui|inputmethod|\.gms|gsf|tvrecommendations|backdrop|dreamx|remote\.service|mediatek|providers|permissioncontroller|\.tts$|tokenmanager|airplay|tclhome|\.ext\.services|tcl\.(ocean|suspension|dashboard|exhibit|guard|partnercustomizer|waterfall|magiconnect)/;
// Shown when the TV lists no apps: common apps, opened by their package with Android TV Remote.
const COMMON_APPS = [['Netflix', 'com.netflix.ninja'], ['YouTube', 'com.google.android.youtube.tv'], ['Disney+', 'com.disney.disneyplus'],
  ['Prime Video', 'com.amazon.amazonvideo.livingroom'], ['Spotify', 'com.spotify.tv.android'], ['YouTube Music', 'com.google.android.youtube.tvmusic']];
// Shown when the TV lists no inputs: Android input keys. Whether a TV follows them depends on the TV.
// Android key names; Android TV Remote sends them as they are, ADB as "input keyevent KEYCODE_<name>".
const COMMON_INPUTS = [['Home', 'HOME'], ['Live TV', 'TV'], ['HDMI 1', 'TV_INPUT_HDMI_1'], ['HDMI 2', 'TV_INPUT_HDMI_2'],
  ['HDMI 3', 'TV_INPUT_HDMI_3'], ['HDMI 4', 'TV_INPUT_HDMI_4'], ['Inputs', 'TV_INPUT']];
// TCL passthrough links for HDMI inputs (opened with remote.turn_on or ADB), and its Live TV app.
const TCL_PASSTHROUGH = port => `content://android.media.tv/passthrough/com.tcl.tvinput%2F.TvPassThroughService%2F${port}`;
const TCL_INPUTS = {'HDMI 1': TCL_PASSTHROUGH('HW15'), 'HDMI 2': TCL_PASSTHROUGH('HW16'), 'HDMI 3': TCL_PASSTHROUGH('HW17'), 'Live TV': 'com.tcl.tv'};
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
  [/hdmi/i, 'mdi:video-input-hdmi'], [/launcher|^home$/i, 'mdi:home-outline'], [/^(tv|live ?tv|antenna|tuner)$/i, 'mdi:television-classic'], [/^inputs$/i, 'mdi:import'],
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
    return part.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, ch => ch.toUpperCase());
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
    items.push({name, callData: launch(pkg), input: isInput.test(name)});
  }

  // Without an installed list, Android TV Remote TVs get common apps; input keys when the TV lists no inputs.
  if (cfg.fallback) {
    if (!items.some(i => !i.input)) {
      for (const [name, activity] of cfg.fallback.apps) items.push({name, callData: call('remote', 'turn_on', {entity_id: cfg.fallback.remote, activity}), input: false});
      fallbackNote.apps = cfg.adb
        ? 'Common apps. Turn the TV on and press Refresh to load the apps installed on it (needs the ADB connection).'
        : 'Common apps. To list the apps on this TV, add them in the Android TV Remote integration\'s options (Configure, then Applications).';
    }
  } else if (cfg.adb && !installed.length && !items.some(i => !i.input)) {
    fallbackNote.apps = 'Turn the TV on and press Refresh to load the apps installed on it (needs the ADB connection).';
  }
  // Input keys for any Android TV (Android TV Remote or ADB) that lists no inputs of its own.
  // (Only HDMI or AV inputs of its own replace the keys; a listed home screen or Live TV app doesn't.)
  if (cfg.inputKeys && cfg.remote && !items.some(i => i.input && /hdmi|^av\b|composite|component/i.test(i.name))) {
    // TCL TVs open HDMI through a passthrough link (HDMI 1 is HW15) and Live TV through their TV app.
    const tcl = cfg.tcl || installed.some(pkg => /^com\.tcl\./.test(pkg));
    const open = target => cfg.androidRemote
      ? call('remote', 'turn_on', {entity_id: cfg.androidRemote, activity: target})
      : call('androidtv', 'adb_command', {entity_id: cfg.adb, command: target.includes('://') ? `am start -a android.intent.action.VIEW -d "${target}"` : `monkey -p ${target} -c android.intent.category.LEANBACK_LAUNCHER 1`});
    cfg.inputKeys.forEach(([name, command], index) => {
      const existing = items.find(i => i.name.toLowerCase() === name.toLowerCase());
      if (existing) { existing.order = index; return; }
      const port = tcl && cfg.tclInputs[name];
      if (tcl && name === 'HDMI 4') return;
      const callData = port && (cfg.androidRemote || cfg.adb) ? open(port) : keyCallFor(cfg.remote.keyPrefix + command);
      items.push({name, callData, input: true, order: index});
    });
    fallbackNote.sources = tcl ? 'Inputs opens the TV\'s own input menu.' : 'Input keys. Some TVs ignore the HDMI keys; Inputs opens the TV\'s own input menu.';
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
    : `<p class="empty">${off ? `Turn ${cfg.tv === false ? 'it' : 'the TV'} on to see its ${kind}.` : kind === 'sources' ? (cfg.tv === false ? 'This sound system doesn\'t list any sources.' : 'This TV doesn\'t list any inputs.') : 'This TV doesn\'t list any apps. For Android TV Remote, add apps in the integration\'s options.'}</p>`;

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
  // A sound system has no apps: only its sources (inputs, playlists, radio), when it lists any.
  if (cfg.tv === false && cfg.canSwitch) {
    tabs.push(['sources', 'mdi:speaker-multiple', 'Sources']);
    panes.push(`<div class="pane sources">${grid(items, 'sources')}</div>`);
  } else if (cfg.canSwitch || cfg.adb || cfg.inputKeys) {
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
  const open = tabs.map(([name]) => `.dw-tv[data-open="${name}"] .tab[data-tab="${name}"]{background:${c.onBg};color:${c.onText};box-shadow:inset 0 0 0 1px ${c.on}}
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
    /* Tabs are a slim segmented bar, so they never look like the app tiles below them. */
    .dw-tv .tabs{display:grid;grid-template-columns:repeat(${tabs.length},minmax(0,1fr));gap:4px;padding:4px;border-radius:999px;background:${c.card};border:1px solid ${c.line}}
    .dw-tv .tab{flex-direction:row;gap:5px;min-height:40px;padding:0 6px;border:none;border-radius:999px;background:transparent;color:${c.muted};font-size:13px;font-weight:600}
    .dw-tv .tab ha-icon{--mdc-icon-size:18px;flex:none}
    .dw-tv .pane{display:none;gap:12px}
    .dw-tv .pad{position:relative;display:grid;grid-template-areas:". up ." "left ok right" ". down .";grid-template-columns:repeat(3,64px);grid-template-rows:repeat(3,64px);
      place-content:center;place-items:center;box-sizing:border-box;width:220px;height:220px;margin:4px auto 0;border-radius:50%;background:${c.surface}}
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

// Runs inside a button-card template: the volume as a slider, with mute and the level in %. When the player
// only steps the volume, two buttons instead. Self-contained: serialised with toString.
function dwellVolume(states, cfg) {
  window.__dwellVol = window.__dwellVol || {
    hass: () => document.querySelector('home-assistant')?.hass,
    show(el) { el.closest('.vl').querySelector('.pc').textContent = el.value + '%'; },
    set(el) { this.hass()?.callService('media_player', 'volume_set', {entity_id: el.dataset.entity, volume_level: Number(el.value) / 100}); },
    mute(el) { this.hass()?.callService('media_player', 'volume_mute', {entity_id: el.dataset.entity, is_volume_muted: el.dataset.muted !== '1'}); },
    step(el) { this.hass()?.callService('media_player', el.dataset.dir === 'up' ? 'volume_up' : 'volume_down', {entity_id: el.dataset.entity}); }
  };
  const btn = `all:unset;box-sizing:border-box;cursor:pointer;display:grid;place-items:center;width:36px;height:36px;border-radius:10px;background:rgba(0,0,0,.18);border:1px solid ${cfg.c.line};color:${cfg.c.text}`;
  const icon = name => `<ha-icon icon="${name}" style="--mdc-icon-size:20px;width:20px;height:20px;display:block"></ha-icon>`;
  if (!cfg.entity) {
    return `<div style="display:flex;align-items:center;gap:8px;justify-content:center">
      <button style="${btn}" aria-label="Volume down" data-entity="${cfg.step}" data-dir="down" onclick="event.stopPropagation();window.__dwellVol.step(this)">${icon('mdi:volume-minus')}</button>
      <span style="color:${cfg.c.muted};font-size:13px">Volume</span>
      <button style="${btn}" aria-label="Volume up" data-entity="${cfg.step}" data-dir="up" onclick="event.stopPropagation();window.__dwellVol.step(this)">${icon('mdi:volume-plus')}</button></div>`;
  }
  const e = states[cfg.entity];
  const level = Math.round((Number(e?.attributes?.volume_level) || 0) * 100);
  const muted = !!e?.attributes?.is_volume_muted;
  const off = !e || ['off', 'unavailable', 'unknown'].includes(e.state);
  const fill = muted ? 0 : level;
  return `<div class="vl" style="display:grid;grid-template-columns:36px 1fr 44px;align-items:center;gap:10px;opacity:${off ? 0.5 : 1}">
    ${cfg.mute ? `<button style="${btn}" aria-label="${muted ? 'Unmute' : 'Mute'}" data-entity="${cfg.mute}" data-muted="${muted ? 1 : 0}" onclick="event.stopPropagation();window.__dwellVol.mute(this)">${icon(muted ? 'mdi:volume-off' : level < 35 ? 'mdi:volume-low' : level < 70 ? 'mdi:volume-medium' : 'mdi:volume-high')}</button>`
      : `<span style="display:grid;place-items:center;color:${cfg.c.muted}">${icon('mdi:volume-high')}</span>`}
    <input type="range" min="0" max="100" step="1" value="${level}" aria-label="Volume" data-entity="${cfg.entity}" ${off ? 'disabled' : ''}
      style="width:100%;height:28px;margin:0;accent-color:${cfg.c.on};cursor:pointer;background:transparent;--fill:${fill}%"
      onclick="event.stopPropagation()" oninput="event.stopPropagation();window.__dwellVol.show(this)" onchange="event.stopPropagation();window.__dwellVol.set(this)">
    <span class="pc" style="font-size:13px;color:${cfg.c.text};text-align:right;font-variant-numeric:tabular-nums">${muted ? 'Muted' : level + '%'}</span></div>`;
}

// Runs inside a button-card template: two buttons, this room's Music Assistant player and the Music
// Assistant app. Self-contained: serialised with toString.
function dwellMaButtons(cfg) {
  window.__dwellTvMa = window.__dwellTvMa || {
    // The player's controls in Home Assistant: now playing, volume, and browse media for that room.
    player(el) { el.dispatchEvent(new CustomEvent('hass-more-info', {detail: {entityId: el.dataset.entity}, bubbles: true, composed: true})); },
    // DwellDeck's own Music Assistant page, with this room's player selected: once the app has loaded in
    // the page, its address gets "#/home?player=<name>" and reloads, which is how Music Assistant picks a player.
    app(el) {
      const name = el.dataset.name;
      const base = location.pathname.split('/').slice(0, 2).join('/');
      history.pushState(null, '', base + '/music-assistant'); window.dispatchEvent(new CustomEvent('location-changed'));
      if (!name) return;
      const deep = root => { for (const node of root.querySelectorAll('*')) { if (node.tagName === 'IFRAME' && /hassio_ingress|music/i.test(node.src)) return node;
        const hit = node.shadowRoot && deep(node.shadowRoot); if (hit) return hit; } return null; };
      clearInterval(window.__dwellTvMaTimer);
      const started = Date.now();
      window.__dwellTvMaTimer = setInterval(() => {
        if (Date.now() - started > 20000) return clearInterval(window.__dwellTvMaTimer);
        const frame = deep(document);
        try {
          const win = frame?.contentWindow;
          if (!win || win.document.readyState !== 'complete' || win.location.href === 'about:blank') return;
          clearInterval(window.__dwellTvMaTimer);
          // Hidden while it reloads; DwellDeck's colours are added before it shows again.
          frame.style.opacity = '0';
          win.location.hash = '#/home?player=' + encodeURIComponent(name);
          win.location.reload();
        } catch (e) { clearInterval(window.__dwellTvMaTimer); }
      }, 300);
    }
  };
  const style = `all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;height:40px;border-radius:12px;background:rgba(0,0,0,.18);border:1px solid ${cfg.c.line};color:${cfg.c.text};font-size:13.5px;font-weight:600`;
  const icon = (name, color) => `<ha-icon icon="${name}" style="--mdc-icon-size:18px;width:18px;height:18px;display:block;color:${color}"></ha-icon>`;
  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%">
    <button style="${style}" data-entity="${cfg.player}" aria-label="Music Assistant player for this room" onclick="event.stopPropagation();window.__dwellTvMa.player(this)">${icon('mdi:music-box-outline', cfg.c.onText)}Music player</button>
    <button style="${style}" data-name="${cfg.playerName}" aria-label="Open Music Assistant with this room's player" onclick="event.stopPropagation();window.__dwellTvMa.app(this)">${icon('mdi:open-in-app', cfg.c.muted)}Music Assistant</button></div>`;
}

// The Music Assistant player for a TV or sound system: one in the same group, or else the Music Assistant
// player whose name matches the room's ("Dany Sound System" → "Dany", "M.Kitchen Sound System" → "M.kitch").
const isMusicAssistant = (id, hass) => ['music_assistant', 'mass'].includes(hass.entities?.[id]?.platform) || 'mass_player_type' in (hass.states?.[id]?.attributes || {});
export function musicAssistantPlayer(players, hass) {
  const lead = players[0];
  // The Music Assistant player with the card's own name comes first ("Master Sound System"): that is the
  // player music is played to in Music Assistant.
  const inGroup = players.find(id => isMusicAssistant(id, hass));
  if (inGroup) return inGroup;
  const clean = text => normalizeName(String(text || '').replace(/sound\s*system|speakers?|audio|amplifier|\bamp\b/gi, ' ')).replace(/\s+/g, ' ').trim();
  const device = hass.devices?.[hass.entities?.[lead]?.device_id]?.name;
  const tvLead = players.some(id => hass.states?.[id]?.attributes?.device_class === 'tv' || TV_PLATFORMS.includes(hass.entities?.[id]?.platform));
  const wanted = [clean(playerName(lead, hass)), clean(device)].filter(name => name.length >= 3);
  const area = entityArea(lead, hass);
  const all = Object.keys(hass.states || {}).filter(id => id.startsWith('media_player.') && isMusicAssistant(id, hass) && !hass.entities?.[id]?.disabled_by);

  const score = id => {
    const name = clean(playerName(id, hass));
    if (name.length < 3) return 0;
    const sameArea = entityArea(id, hass) && entityArea(id, hass) === area ? 1 : 0;
    // The very same name first ("Master Sound System"), then the room name ("Master"), then partial.
    if (normalizeName(playerName(id, hass)) === normalizeName(playerName(lead, hass))) return 6 + sameArea;
    if (wanted.includes(name)) return 4 + sameArea;
    // Partial names ("M.kitch" for "M.Kitchen") only for sound systems: "Kitchen" is not the Kitchen TV.
    if (!tvLead && wanted.some(w => w.startsWith(name) || name.startsWith(w))) return 2 + sameArea;
    return 0;
  };
  const pick = candidates => {
    const best = candidates.map(id => [id, score(id)]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    // Only a clear winner: two equally good matches link nothing rather than the wrong room.
    return best.length && (best.length === 1 || best[0][1] > best[1][1]) ? best[0][0] : null;
  };
  return pick(all);
}

export function tvCard(requested, hass) {
  const players = tvGroup(requested, hass);
  const id = players[0];
  // A sound system gets the same card without TV wording.
  const tv = players.some(entry => tvEntry(entry, hass));
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
  // A sound system's Music Assistant player also counts: it skips tracks and sets the volume.
  const ma = musicAssistantPlayer(players, hass);
  const sources = ma && !players.includes(ma) ? [...players, ma] : players;
  const skipPlayer = playerFor(sources, hass, FEATURE.next | FEATURE.previous) || playPlayer;
  const sliderPlayer = playerFor(sources, hass, FEATURE.volumeSet);
  // What plays on a sound system comes from its Music Assistant player: watch it for the title and artwork.
  const watched = [...new Set([...sources, ...(remote ? [remote.id] : [])])];
  // Status comes from whichever entry is on: the TV's own player first, then anything playing.
  const current = `const OFFS=${OFF}; const known=${JSON.stringify(KNOWN_PACKAGES)};
    const nice = v => { if (!v) return ''; const t = String(v).trim(); if (known[t]) return known[t]; if (/launcher/i.test(t)) return 'Home';
      if (!/^[a-z][\\w]*(\\.[\\w:]+)+$/i.test(t)) return t;
      const part = t.split(/[.:]/).filter(w => !/^(com|net|org|tv|android|androidtv|google|app|apps|mobile|ninja|livingroom|leanback)$/i.test(w)).pop() || t;
      return part.charAt(0).toUpperCase() + part.slice(1); };
    const all=${JSON.stringify(sources)}.map(p=>states[p]).filter(Boolean); const live=all.filter(p=>!OFFS.includes(p.state));
    const lead=states[${JSON.stringify(id)}]; const tvs=live.filter(p=>p.attributes?.device_class==='tv');
    // When the card has real TV entries, they decide on or off: a cast or speaker entry that keeps "playing"
    // while the TV is off doesn't make the TV look on.
    const hasTv=all.some(p=>p.attributes?.device_class==='tv');
    // A sound system shows whichever of its players is playing something with a title or picture
    // (its Music Assistant player), so the music and artwork appear on the card.
    const withMedia=live.find(p=>['playing','paused'].includes(p.state)&&(p.attributes?.media_title||p.attributes?.entity_picture_local||p.attributes?.entity_picture));
    const m=!hasTv && withMedia ? withMedia : (lead && !OFFS.includes(lead.state)) ? lead : tvs[0] || (hasTv ? lead : live.find(p=>p.state==='playing') || lead);
    const r=${remote?.id.startsWith('remote.') ? `states[${JSON.stringify(remote.id)}]` : 'undefined'};
    const cur = nice(r && r.state !== 'off' ? r.attributes?.current_activity : '') || live.map(p => nice(p.attributes?.app_name) || nice(p.attributes?.app_id) || p.attributes?.source).find(Boolean) || '';`;
  // One on/off rule for the status, the TV icon and the power button: the entry the status uses is on.
  const isOn = `${current} const on = !!m && !OFFS.includes(m.state);`;
  const canSwitch = remote?.platform === 'androidtv_remote' || players.some(p =>
    (Number(hass.states?.[p]?.attributes?.supported_features) & 2048) || hass.states?.[p]?.attributes?.source_list?.length);
  const cfg = {
    lead: id, players, canSwitch, tv, c: C, known: KNOWN_PACKAGES, inputPattern: SOURCE_PATTERN.source,
    icons: APP_ICONS.map(([pattern, icon, color]) => [pattern.source, icon, color || '']),
    activities: remote?.platform === 'androidtv_remote' ? remote.id : null,
    keyboard: !!remote?.commands?.keyboard,
    fallback: remote?.platform === 'androidtv_remote' ? {remote: remote.id, apps: COMMON_APPS} : null,
    adb: players.find(p => hass.entities?.[p]?.platform === 'androidtv') || null,
    androidRemote: remote?.platform === 'androidtv_remote' ? remote.id : null,
    fetchCommand: FETCH_APPS, hiddenPackages: HIDDEN_PACKAGES.source,
    remote: remote && {
      domain: remote.platform === 'androidtv' ? 'androidtv' : 'remote', service: remote.platform === 'androidtv' ? 'adb_command' : 'send_command',
      target: remote.id, keys: remote.commands, keyPrefix: remote.platform === 'androidtv' ? 'input keyevent KEYCODE_' : ''
    },
    inputKeys: ['androidtv_remote', 'androidtv'].includes(remote?.platform) ? COMMON_INPUTS : null,
    tcl: [...players, ...(remote ? [remote.id] : [])].some(e => /tcl/i.test(`${hass.devices?.[hass.entities?.[e]?.device_id]?.manufacturer || ''} ${hass.devices?.[hass.entities?.[e]?.device_id]?.model || ''}`)),
    tclInputs: TCL_INPUTS
  };

  // One console line per TV, so a setup can be checked from the browser console (F12).
  const logged = typeof window !== 'undefined' ? (window.__dwellTvLogged ||= new Set()) : null;
  if (typeof document !== 'undefined' && typeof console !== 'undefined' && !logged?.has(id) && logged?.add(id)) {
    console.info(`DwellDeck ${tv ? 'TV' : 'sound system'} "${name}": entries ${players.join(', ')}; remote ${remote ? `${remote.id} (${remote.platform})` : 'none'}; ` +
      `power ${power.perform_action} ${power.target?.entity_id}; volume ${volumePlayer}; play ${playPlayer}`);
  }
  const fields = {
    // Power follows the same on/off as the status line, and updates live (it watches every entry of the TV).
    power: {card: {
      ...key('Power', 'mdi:power', power), entity: powerPlayer || id, triggers_update: watched, variables: {dwell_static: true},
      styles: {...key('Power', 'mdi:power').styles,
        icon: [{width: '24px'}, {color: `[[[ ${isOn} return on ? '${C.card}' : '${C.muted}'; ]]]`}],
        card: [
          {background: `[[[ ${isOn} return on ? '${C.on}' : 'transparent'; ]]]`},
          {border: `[[[ ${isOn} return on ? '1px solid ${C.on}' : '1px solid ${C.line}'; ]]]`},
          {'border-radius': '50%'}, {'box-shadow': `[[[ ${isOn} return on ? '0 0 14px rgba(213,167,76,.35)' : 'none'; ]]]`},
          {width: '46px'}, {height: '46px'}, {padding: '0'}, {transition: 'background .3s ease, box-shadow .3s ease'}]}
    }},
    // Previous, play or pause, next; the volume is a slider below.
    media: {card: group('"down play up"', 'repeat(3,1fr)', {
      down: key('Previous', 'mdi:skip-previous', player('media_previous_track', skipPlayer)),
      play: key('Play or pause', 'mdi:play-pause', player('media_play_pause', playPlayer)),
      up: key('Next', 'mdi:skip-next', player('media_next_track', skipPlayer))
    })}
  };
  // Now playing: status, artwork, title, artist or series, and the app.
  fields.now = `[[[ ${current}
    const esc = v => String(v).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const off = !m || ${OFF}.includes(m.state);
    // The title can sit on another entry of the same TV (its Cast, DLNA or Music Assistant entry).
    // DLNA renderers are left out: they keep an old title ("Home Assistant") long after it stopped.
    const titled = !off && (m.attributes?.media_title ? m : live.find(p => ${JSON.stringify(sources.filter(p => hass.entities?.[p]?.platform !== 'dlna_dmr'))}.includes(p.entity_id)
      && ['playing', 'paused'].includes(p.state) && p.attributes?.media_title));
    const playing = m;
    const a = {...(playing?.attributes || {}), ...(titled && titled !== m ? {media_title: titled.attributes.media_title, media_series_title: titled.attributes.media_series_title,
      media_artist: titled.attributes.media_artist, media_album_name: titled.attributes.media_album_name,
      entity_picture_local: titled.attributes.entity_picture_local, entity_picture: titled.attributes.entity_picture} : {})};
    const state = !m ? 'Unavailable' : off ? 'Off' : playing.state === 'playing' ? 'Playing' : playing.state === 'paused' ? 'Paused' : playing.state === 'buffering' ? 'Loading' : 'On';
    const title = a.media_title || '';
    const detail = [a.media_series_title, a.media_artist, a.media_album_name].filter(Boolean).filter((v, i, list) => list.indexOf(v) === i).join(', ');
    const app = cur || a.app_name || '';
    const color = state === 'Playing' ? '${C.onText}' : state === 'Off' || state === 'Unavailable' ? '${C.muted}' : '${C.text}';
    const pill = '<span style="flex:none;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600;color:' + color + ';border:1px solid ' + (state === 'Playing' ? '${C.on}' : '${C.line}') + '">' + state + '</span>';
    if (off || (!title && !app)) return '<div style="display:flex;align-items:center;gap:10px;width:100%;color:${C.muted};font-size:13px;text-align:left">' + pill + '<span>' + (off ? '${tv ? 'The TV is off.' : 'Off.'}' : 'Nothing playing.') + '</span></div>';
    // Home Assistant's own link to the artwork works from anywhere; the player's own address may not.
    const pic = a.entity_picture_local || a.entity_picture;
    const art = pic ? '<div style="flex:none;width:56px;height:56px;border-radius:10px;background:${C.card} url(&quot;' + esc(pic) + '&quot;) center/cover"></div>' : '';
    return '<div style="display:flex;align-items:center;gap:12px;width:100%;min-width:0;text-align:left">' + art
      + '<div style="min-width:0;flex:1"><div style="display:flex;align-items:center;gap:8px;min-width:0">' + pill
      + '<span style="font-size:12px;color:${C.muted};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(app) + '</span></div>'
      + (title ? '<div style="margin-top:4px;font-size:15px;font-weight:600;color:${C.text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(title) + '</div>' : '')
      + (detail ? '<div style="font-size:13px;color:${C.muted};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(detail) + '</div>' : '')
      + '</div></div>';
  ]]]`;
  const areas = ['"i n power"', '"i l power"', '"now now now"', '"media media media"'];
  if (sliderPlayer || volumePlayer) {
    fields.vol = `[[[ return (${dwellVolume.toString()})(states, ${JSON.stringify({entity: sliderPlayer, step: sliderPlayer ? null : volumePlayer,
      mute: playerFor(sources, hass, FEATURE.volumeMute), c: {line: C.line, text: C.text, muted: C.muted, on: C.on, onText: C.onText, card: C.card}})}); ]]]`;
    areas.push('"vol vol vol"');
  }
  if (ma) {
    // Two buttons under the controls: this room's Music Assistant player, and the Music Assistant app.
    fields.ma = `[[[ return (${dwellMaButtons.toString()})(${JSON.stringify({player: ma, playerName: String(playerName(ma, hass)).replace(/["<>&]/g, ''), c: {line: C.line, text: C.text, onText: C.onText, muted: C.muted}})}); ]]]`;
    areas.push('"ma ma ma"');
  }
  if (remote || canSwitch) {
    fields.panel = `[[[ return (${dwellTvPanel.toString()})(states, ${JSON.stringify(cfg)}); ]]]`;
    areas.push('"panel panel panel"');
  }
  // Header: button-card's own icon, name and label, so it lines up on the left.
  const status = `[[[ ${current}
    const off = !m || ${OFF}.includes(m.state);
    return !m ? 'Unavailable' : off ? 'Off' : cur ? 'On, ' + cur : 'On'; ]]]`;
  return {
    type: 'custom:button-card', entity: id, name, icon: tv ? 'mdi:television' : 'mdi:speaker', show_name: true, show_icon: true, show_state: false, show_label: true, label: status,
    tap_action: {action: 'none'}, hold_action: {action: 'more-info'}, triggers_update: watched,
    // The card fills its grid cell, so cards side by side end on one line.
    extra_styles: ':host{display:block;height:100%}',
    grid_options: {columns: 12, rows: 'auto'},
    custom_fields: fields,
    styles: {
      // Cards in one row stretch to the same height.
      card: [{padding: '16px'}, {height: '100%'}, {'box-sizing': 'border-box'}, {'align-content': 'start'}, {'border-radius': '20px'}, {border: `1px solid ${C.line}`}, {overflow: 'hidden'},
        // The artwork of whatever plays fills the card behind a dark veil.
        {background: `[[[ ${current} const p = m?.attributes?.entity_picture_local || m?.attributes?.entity_picture; return m && m.state === 'playing' && p ? 'linear-gradient(180deg,rgba(10,20,32,.72),rgba(10,20,32,.94) 60%),url("' + p + '") center/cover' : 'linear-gradient(160deg,${C.surface},${C.card})'; ]]]`}],
      grid: [{'grid-template-areas': areas.join(' ')}, {'grid-template-columns': '40px minmax(0,1fr) 46px'}, {gap: '2px 12px'}, {'align-items': 'center'}],
      img_cell: [{'justify-content': 'flex-start'}, {width: '40px'}, {height: '40px'}],
      icon: [{width: '28px'}, {color: `[[[ ${isOn} return on ? '${C.onText}' : '${C.muted}'; ]]]`}],
      name: [{'justify-self': 'start'}, {'align-self': 'end'}, {'font-size': '17px'}, {'font-weight': '600'}, {color: C.text}, {'text-align': 'left'}, {'white-space': 'nowrap'}, {overflow: 'hidden'}, {'text-overflow': 'ellipsis'}, {'max-width': '100%'}],
      label: [{'justify-self': 'start'}, {'align-self': 'start'}, {'font-size': '13px'}, {color: C.muted}, {'text-align': 'left'}, {'white-space': 'nowrap'}, {overflow: 'hidden'}, {'text-overflow': 'ellipsis'}, {'max-width': '100%'}],
      custom_fields: {power: [{'justify-self': 'end'}], now: [{'justify-self': 'stretch'}, {'margin-top': '12px'}, {padding: '10px 12px'}, {'border-radius': '14px'}, {background: 'rgba(0,0,0,.18)'}, {border: `1px solid ${C.line}`}], media: [{'justify-self': 'stretch'}, {'margin-top': '14px'}],
        panel: [{'justify-self': 'stretch'}, {'margin-top': '10px'}, {width: '100%'}, {'pointer-events': 'auto'}],
        ma: [{'justify-self': 'stretch'}, {'margin-top': '10px'}, {width: '100%'}, {'pointer-events': 'auto'}],
        vol: [{'justify-self': 'stretch'}, {'margin-top': '10px'}, {width: '100%'}, {'pointer-events': 'auto'}]}
    }
  };
}
