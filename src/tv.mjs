// One compact card per TV: what's on, power, volume and playback, and buttons that open
// tidy popups: Remote, Apps, Sources and Keyboard. Built from nested button-cards and Browser Mod
// popups, so every control is a normal Home Assistant action.

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

// How to send remote keys to this player: its device's remote entity, or ADB on the player itself.
export function tvRemote(id, hass) {
  if (hass.entities?.[id]?.platform === 'androidtv') {
    return {id, platform: 'androidtv', commands: TV_REMOTES.androidtv,
      send: command => ({action: 'perform-action', perform_action: 'androidtv.adb_command', target: {entity_id: id}, data: {command}})};
  }
  const device = hass.entities?.[id]?.device_id;
  const remote = device && Object.values(hass.entities || {}).find(entry => entry.device_id === device &&
    entry.entity_id?.startsWith('remote.') && TV_REMOTES[entry.platform] && entry.platform !== 'androidtv');
  if (!remote) return null;
  return {id: remote.entity_id, platform: remote.platform, commands: TV_REMOTES[remote.platform],
    send: (command, extra = {}) => ({action: 'perform-action', perform_action: 'remote.send_command', target: {entity_id: remote.entity_id}, data: {command, ...extra}})};
}

// One TV can appear through several integrations ("Saloon TV" and "Saloon TV ADB").
// Players in the same area with the same base name become one card; the best-controlled one leads.
const playerName = (id, hass) => hass.states?.[id]?.attributes?.friendly_name || hass.entities?.[id]?.name || hass.entities?.[id]?.original_name || id.split('.')[1].replaceAll('_', ' ');
const baseName = (id, hass) => normalizeName(playerName(id, hass)).replace(/\b(adb|remote|cast|chromecast)\b/g, ' ').replace(/\s+/g, ' ').trim();
const rank = (id, hass) => {
  const remote = tvRemote(id, hass);
  return remote && remote.platform !== 'androidtv' ? 0 : remote ? 1 : 2;
};
export function tvGroup(id, hass) {
  const base = baseName(id, hass);
  const area = entityArea(id, hass);
  const players = Object.keys(hass.entities || hass.states || {}).filter(other => other.startsWith('media_player.'));
  const peers = base ? players.filter(other => other !== id && entityArea(other, hass) === area && baseName(other, hass) === base &&
    !hass.entities?.[other]?.hidden_by && !hass.entities?.[other]?.disabled_by) : [];
  return [id, ...peers].sort((a, b) => rank(a, hass) - rank(b, hass) || a.localeCompare(b));
}
// Drops the extra players of a merged TV when the leading player is in the same list.
export const withoutDuplicatePlayers = (ids, hass) => ids.filter(id => {
  if (!id.startsWith('media_player.')) return true;
  const lead = tvGroup(id, hass)[0];
  return lead === id || !ids.includes(lead);
});

// Friendly names for common Android TV packages; other package names are system services and are hidden.
const KNOWN_PACKAGES = {
  'com.netflix.ninja': 'Netflix', 'com.google.android.youtube.tv': 'YouTube', 'com.google.android.youtube.tvmusic': 'YouTube Music',
  'com.disney.disneyplus': 'Disney+', 'com.amazon.amazonvideo.livingroom': 'Prime Video', 'com.spotify.tv.android': 'Spotify',
  'net.mbc.shahid.androidtv': 'Shahid', 'net.mbc.shahidtv': 'Shahid', 'com.tod.tv': 'TOD', 'com.bein.tod': 'TOD',
  'com.apple.atve.androidtv.appletv': 'Apple TV', 'com.plexapp.android': 'Plex', 'org.xbmc.kodi': 'Kodi',
  'com.google.android.tvlauncher': 'Home', 'com.google.android.apps.tv.launcherx': 'Home', 'com.android.tv.settings': 'Settings',
  'com.google.android.apps.mediashell': 'Google Cast', 'com.google.android.videos': 'Google TV', 'tv.twitch.android.app': 'Twitch'
};
const SOURCE_PATTERN = /hdmi|^tv$|live ?tv|antenna|tuner|^av\b|composite|component|usb|launcher|^home$/i;
const APP_ICONS = [[/netflix/i, 'mdi:netflix'], [/youtube/i, 'mdi:youtube'], [/spotify/i, 'mdi:spotify'],
  [/disney/i, 'mdi:movie-open-star-outline'], [/prime|amazon/i, 'mdi:movie-play-outline'], [/apple ?tv|tv\+/i, 'mdi:apple'],
  [/plex/i, 'mdi:plex'], [/kodi/i, 'mdi:kodi'], [/twitch/i, 'mdi:twitch'], [/cast/i, 'mdi:cast'], [/hdmi/i, 'mdi:video-input-hdmi'],
  [/launcher|^home$/i, 'mdi:home-outline'], [/^(tv|live ?tv|antenna|tuner)$/i, 'mdi:television-classic'],
  [/music/i, 'mdi:music-note-outline'], [/settings/i, 'mdi:cog-outline'], [/usb/i, 'mdi:usb']];
const appIcon = name => APP_ICONS.find(([pattern]) => pattern.test(name))?.[1] || 'mdi:application-outline';

// A readable name for a list entry, or null for package names that are system services.
export function appName(entry) {
  const text = String(entry || '').trim();
  if (!text) return null;
  if (KNOWN_PACKAGES[text]) return KNOWN_PACKAGES[text];
  if (/launcher/i.test(text)) return 'Home';
  if (/^[a-z][\w]*(\.[\w:]+)+$/i.test(text)) return null;
  return text;
}

// Apps and inputs, each with the action that opens it. Inputs are HDMI, TV, the home screen and similar.
export function tvLaunchers(players, hass, remote) {
  const activities = remote?.platform === 'androidtv_remote' ? hass.states?.[remote.id]?.attributes?.activity_list || [] : [];
  const seen = new Set();
  const items = [];
  const add = (raw, open) => {
    const name = appName(raw);
    if (!name || seen.has(name.toLowerCase())) return;
    seen.add(name.toLowerCase());
    items.push({name, raw, open, input: SOURCE_PATTERN.test(name)});
  };
  for (const raw of activities) add(raw, {action: 'perform-action', perform_action: 'remote.turn_on', target: {entity_id: remote.id}, data: {activity: raw}});
  for (const player of players) for (const raw of hass.states?.[player]?.attributes?.source_list || []) {
    add(raw, {action: 'perform-action', perform_action: 'media_player.select_source', target: {entity_id: player}, data: {source: raw}});
  }
  const sort = list => list.sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true}));
  return {apps: sort(items.filter(item => !item.input)).slice(0, 40), inputs: sort(items.filter(item => item.input)).slice(0, 16)};
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
const rows = (names, perRow) => {
  const out = [];
  for (let i = 0; i < names.length; i += perRow) out.push(`"${[...names.slice(i, i + perRow), ...Array(perRow).fill('.')].slice(0, perRow).join(' ')}"`);
  return out.join(' ');
};
const popup = (title, content) => ({action: 'fire-dom-event', browser_mod: {service: 'browser_mod.popup', data: {title, content}}});

// A grid of launch tiles; the one in use is highlighted.
function launcherGrid(items, current, watched) {
  const tiles = Object.fromEntries(items.map((item, index) => {
    const tile = key(item.name, appIcon(item.name), item.open, {label: true, size: 30, height: 84});
    const active = `[[[ ${current} return cur === ${JSON.stringify(item.raw)} || cur === ${JSON.stringify(item.name)}`;
    tile.triggers_update = watched;
    // Only the tile in use lights up; the dashboard's activity glow stays off.
    tile.variables = {dwell_static: true};
    tile.styles.card = [{background: `${active} ? 'linear-gradient(135deg,${C.onBg},${C.surfaceEnd})' : 'linear-gradient(135deg,${C.surface},${C.surfaceEnd})'; ]]]`},
      {border: `${active} ? '1px solid ${C.on}' : '1px solid ${C.line}'; ]]]`},
      {'border-radius': '14px'}, {'box-shadow': 'none'}, {padding: '12px 6px 10px'}, {'min-height': '84px'}];
    return [`t${index}`, tile];
  }));
  return group(rows(Object.keys(tiles), 3), 'repeat(3,minmax(0,1fr))', tiles);
}

export function tvCard(requested, hass) {
  const players = tvGroup(requested, hass);
  const id = players[0];
  const name = playerName(id, hass);
  const remote = players.map(player => tvRemote(player, hass)).find(Boolean);
  const c = remote?.commands || {};
  const player = (action, data) => ({action: 'perform-action', perform_action: `media_player.${action}`, target: {entity_id: id}, ...(data ? {data} : {})});
  const watched = [...new Set([...players, ...(remote ? [remote.id] : [])])];
  const current = `const m=states[${JSON.stringify(id)}]; const r=${remote?.id.startsWith('remote.') ? `states[${JSON.stringify(remote.id)}]` : 'undefined'}; const all=${JSON.stringify(players)}.map(p=>states[p]).filter(Boolean); const cur = r?.attributes?.current_activity || all.map(p=>p.attributes?.app_name || p.attributes?.source).find(Boolean);`;
  const {apps, inputs} = tvLaunchers(players, hass, remote);

  // Remote popup: round pad, then Back, Home, Menu, then volume.
  const remoteContent = remote && (() => {
    const send = remote.send;
    const repeat = remote.platform !== 'androidtv';
    const arrow = (dir, icon) => key(dir[0].toUpperCase() + dir.slice(1), icon, send(c[dir]), {round: true, size: 30, height: 56,
      hold: repeat ? send(c[dir], {num_repeats: 5}) : undefined});
    const ok = key('OK', 'mdi:circle-medium', send(c.ok), {size: 26, height: 72, hold: repeat ? send(c.ok, {hold_secs: 0.6}) : undefined});
    ok.styles.card = [{background: `linear-gradient(135deg,${C.surface},${C.card})`}, {border: `1px solid ${C.line}`}, {'border-radius': '50%'},
      {'box-shadow': 'none'}, {width: '72px'}, {height: '72px'}, {margin: 'auto'}];
    const pad = group('". up ." "left ok right" ". down ."', '1fr 1fr 1fr', {
      up: arrow('up', 'mdi:chevron-up'), left: arrow('left', 'mdi:chevron-left'), ok, right: arrow('right', 'mdi:chevron-right'), down: arrow('down', 'mdi:chevron-down')
    }, {card: [{background: `radial-gradient(circle at 50% 50%,${C.surface} 0 64%,transparent 65%)`}, {padding: '14px'}, {width: '260px'}, {margin: '4px auto 0'}],
      grid: [{'align-items': 'center'}, {'justify-items': 'center'}]});
    const nav = group('"back home menu"', 'repeat(3,1fr)', {
      back: key('Back', 'mdi:arrow-left', send(c.back), {label: true}),
      home: key('Home', 'mdi:home-outline', send(c.home), {label: true}),
      menu: key('Menu', 'mdi:menu', send(c.menu), {label: true})
    });
    const volume = group('"down mute up"', 'repeat(3,1fr)', {
      down: key('Volume down', 'mdi:volume-minus', player('volume_down'), {label: true}),
      mute: c.mute ? key('Mute', 'mdi:volume-off', send(c.mute), {label: true}) : key('Play or pause', 'mdi:play-pause', player('media_play_pause'), {label: true}),
      up: key('Volume up', 'mdi:volume-plus', player('volume_up'), {label: true})
    });
    return {type: 'vertical-stack', cards: [pad, nav, volume]};
  })();

  // The card's own launch buttons, each opening a popup.
  const launch = {};
  const big = {label: true, size: 26, height: 72};
  if (remoteContent) launch.remote = key('Remote', 'mdi:remote-tv', popup(`${name} remote`, remoteContent), big);
  if (apps.length) launch.apps = key('Apps', 'mdi:apps', popup(`${name} apps`, launcherGrid(apps, current, watched)), big);
  if (inputs.length) launch.sources = key('Sources', 'mdi:video-input-hdmi', popup(`${name} sources`, launcherGrid(inputs, current, watched)), big);
  if (remote?.commands?.keyboard) launch.keys = key('Keyboard', 'mdi:keyboard-outline', {action: 'fire-dom-event', browser_mod: {service: 'browser_mod.popup', data: {
    title: `Type on ${name}`, content: [{name: 'command', label: 'Text', selector: {text: {}}}],
    right_button: 'Send', right_button_action: {service: 'remote.send_command', data: {entity_id: remote.id}}, left_button: 'Close'}}}, big);

  const fields = {
    head: `[[[ ${current}
      const off = !m || ${OFF}.includes(m.state);
      const app = cur;
      const title = [m?.attributes?.media_title, m?.attributes?.media_artist].filter(Boolean).join(', ');
      const status = !m ? 'Unavailable' : off ? 'Off' : [app, title].filter(Boolean).join(': ') || (m.state.charAt(0).toUpperCase() + m.state.slice(1));
      const esc = s => String(s).replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
      return '<div style="display:flex;align-items:center;justify-content:flex-start;gap:12px;width:100%;min-width:0;text-align:left">'
        + '<ha-icon icon="mdi:television" style="--mdc-icon-size:28px;color:' + (off ? '${C.muted}' : '${C.onText}') + ';flex:none"></ha-icon>'
        + '<div style="min-width:0;flex:1"><div style="font-size:17px;font-weight:600;color:${C.text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(${JSON.stringify(name)}) + '</div>'
        + '<div style="font-size:13px;color:${C.muted};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(status) + '</div></div></div>';
    ]]]`,
    power: {card: {
      ...key('Power', 'mdi:power', player('toggle')), entity: id, triggers_update: [],
      styles: {...key('Power', 'mdi:power').styles, card: [
        {background: `[[[ return ${OFF}.includes(entity?.state) ? 'linear-gradient(135deg,${C.surface},${C.surfaceEnd})' : 'linear-gradient(135deg,${C.onBg},${C.surfaceEnd})'; ]]]`},
        {border: `[[[ return ${OFF}.includes(entity?.state) ? '1px solid ${C.line}' : '1px solid ${C.on}'; ]]]`},
        {'border-radius': '50%'}, {'box-shadow': 'none'}, {width: '46px'}, {height: '46px'}, {padding: '0'}]}
    }},
    media: {card: group('"down play up"', 'repeat(3,1fr)', {
      down: key('Volume down', 'mdi:volume-minus', player('volume_down')),
      play: key('Play or pause', 'mdi:play-pause', player('media_play_pause')),
      up: key('Volume up', 'mdi:volume-plus', player('volume_up'))
    })}
  };
  const areas = ['"head power"', '"media media"'];
  if (Object.keys(launch).length) {
    fields.launch = {card: group(`"${Object.keys(launch).join(' ')}"`, `repeat(${Object.keys(launch).length},minmax(0,1fr))`, launch)};
    areas.push('"launch launch"');
  }

  return {
    type: 'custom:button-card', entity: id, show_name: false, show_icon: false, show_state: false,
    tap_action: {action: 'none'}, hold_action: {action: 'more-info'}, triggers_update: watched,
    grid_options: {columns: 12, rows: 'auto'},
    custom_fields: fields,
    styles: {
      card: [{padding: '16px'}, {'border-radius': '20px'}, {border: `1px solid ${C.line}`}, {overflow: 'hidden'},
        {background: `[[[ const p = entity?.attributes?.entity_picture; return entity?.state === 'playing' && p ? 'linear-gradient(180deg,rgba(10,20,32,.72),rgba(10,20,32,.94) 60%),url("' + p + '") center/cover' : 'linear-gradient(160deg,${C.surface},${C.card})'; ]]]`}],
      grid: [{'grid-template-areas': areas.join(' ')}, {'grid-template-columns': 'minmax(0,1fr) 46px'}, {gap: '14px 12px'}, {'align-items': 'center'}],
      custom_fields: {head: [{'justify-self': 'stretch'}, {'min-width': '0'}, {width: '100%'}], power: [{'justify-self': 'end'}],
        media: [{'justify-self': 'stretch'}], launch: [{'justify-self': 'stretch'}]}
    }
  };
}
