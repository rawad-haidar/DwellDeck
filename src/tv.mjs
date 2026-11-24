// One card per TV: what's on, power, a remote pad, volume and playback, keyboard, and apps and inputs.
// Built from nested button-cards so every control keeps a normal Home Assistant action.

// Remote commands per integration. Both integrations create a remote entity on the TV's device.
export const TV_REMOTES = {
  androidtv_remote: {up: 'DPAD_UP', down: 'DPAD_DOWN', left: 'DPAD_LEFT', right: 'DPAD_RIGHT', ok: 'DPAD_CENTER',
    back: 'BACK', home: 'HOME', menu: 'MENU', volumeUp: 'VOLUME_UP', volumeDown: 'VOLUME_DOWN', mute: 'MUTE',
    playPause: 'MEDIA_PLAY_PAUSE', keyboard: true},
  apple_tv: {up: 'up', down: 'down', left: 'left', right: 'right', ok: 'select', back: 'menu', home: 'home',
    menu: 'top_menu', volumeUp: 'volume_up', volumeDown: 'volume_down', playPause: 'play_pause'}
};

// The remote entity on the same device as the media player, if its integration is supported.
export function tvRemote(id, hass) {
  const device = hass.entities?.[id]?.device_id;
  if (!device) return null;
  const remote = Object.values(hass.entities || {}).find(entry => entry.device_id === device &&
    entry.entity_id?.startsWith('remote.') && TV_REMOTES[entry.platform]);
  return remote ? {id: remote.entity_id, commands: TV_REMOTES[remote.platform]} : null;
}

const APP_ICONS = [[/netflix/i, 'mdi:netflix'], [/youtube/i, 'mdi:youtube'], [/spotify/i, 'mdi:spotify'],
  [/disney/i, 'mdi:movie-open-star-outline'], [/prime|amazon/i, 'mdi:movie-play-outline'], [/apple ?tv|tv\+/i, 'mdi:apple'],
  [/plex/i, 'mdi:plex'], [/kodi/i, 'mdi:kodi'], [/twitch/i, 'mdi:twitch'], [/hdmi/i, 'mdi:video-input-hdmi'],
  [/^(tv|live tv|antenna|tuner)$/i, 'mdi:television-classic'], [/music/i, 'mdi:music-note-outline'],
  [/settings/i, 'mdi:cog-outline'], [/photo/i, 'mdi:image-multiple-outline'], [/^home$/i, 'mdi:home-outline']];

const C = {
  surface: '#1b2d40', surfaceEnd: '#172638', card: '#101c2b', text: '#edf5ff', muted: '#91a8bd',
  line: 'rgba(156,199,225,.12)', onBg: '#493b24', on: '#d5a74c', onText: '#efc875'
};

// A small key. Nested cards have no entity, so taps only run their own action.
function key(name, icon, tap, {hold, label = false, round = false, size = 22} = {}) {
  return {
    type: 'custom:button-card', name, icon, show_name: label, show_state: false,
    tap_action: tap, hold_action: hold || {action: 'none'},
    styles: {
      card: [{background: round ? 'transparent' : `linear-gradient(135deg,${C.surface},${C.surfaceEnd})`},
        {border: round ? 'none' : `1px solid ${C.line}`}, {'border-radius': round ? '50%' : '12px'},
        {'box-shadow': 'none'}, {padding: label ? '8px 2px' : '0'}, {height: label ? 'auto' : '44px'}],
      icon: [{width: `${size}px`}, {color: C.text}],
      name: [{'font-size': '12px'}, {color: C.muted}, {'margin-top': '2px'}]
    }
  };
}
// A button-card used only as a layout grid for nested keys.
function group(areas, columns, fields, extra = {}) {
  return {
    type: 'custom:button-card', show_name: false, show_icon: false, show_state: false, tap_action: {action: 'none'}, hold_action: {action: 'none'},
    styles: {
      card: [{background: 'transparent'}, {border: 'none'}, {'box-shadow': 'none'}, {padding: '0'}, {overflow: 'visible'}, ...(extra.card || [])],
      grid: [{'grid-template-areas': areas}, {'grid-template-columns': columns}, {gap: '8px'}, ...(extra.grid || [])],
      custom_fields: Object.fromEntries(Object.keys(fields).map(k => [k, [{width: '100%'}]]))
    },
    custom_fields: Object.fromEntries(Object.entries(fields).map(([k, card]) => [k, {card}]))
  };
}

// Apps (Android TV Remote activities) first, then inputs and apps the player lists as sources.
export function tvApps(id, hass, remote) {
  const activities = remote ? hass.states?.[remote.id]?.attributes?.activity_list || [] : [];
  const sources = hass.states?.[id]?.attributes?.source_list || [];
  const seen = new Set();
  return [...activities.map(name => ({name, kind: 'activity'})), ...sources.map(name => ({name, kind: 'source'}))]
    .filter(app => typeof app.name === 'string' && app.name.trim() && !seen.has(app.name.toLowerCase()) && seen.add(app.name.toLowerCase()))
    .slice(0, 30);
}

export function tvCard(id, hass) {
  const attributes = hass.states?.[id]?.attributes || {};
  const name = attributes.friendly_name || hass.entities?.[id]?.name || hass.entities?.[id]?.original_name || id.split('.')[1].replaceAll('_', ' ');
  const remote = tvRemote(id, hass);
  const c = remote?.commands || {};
  const send = (command, data = {}) => ({action: 'perform-action', perform_action: 'remote.send_command', target: {entity_id: remote.id}, data: {command, ...data}});
  const player = (action, data) => ({action: 'perform-action', perform_action: `media_player.${action}`, target: {entity_id: id}, ...(data ? {data} : {})});
  const watched = [id, ...(remote ? [remote.id] : [])];
  const current = `const m=states[${JSON.stringify(id)}]; const r=${remote ? `states[${JSON.stringify(remote.id)}]` : 'undefined'};`;

  const fields = {};
  const areas = ['"head head power"'];
  fields.head = `[[[ ${current}
    const off = !m || ['off','standby','unavailable','unknown'].includes(m.state);
    const app = r?.attributes?.current_activity || m?.attributes?.app_name || m?.attributes?.source;
    const title = [m?.attributes?.media_title, m?.attributes?.media_artist].filter(Boolean).join(', ');
    const status = !m ? 'Unavailable' : off ? 'Off' : [app, title].filter(Boolean).join(': ') || (m.state.charAt(0).toUpperCase() + m.state.slice(1));
    const esc = s => String(s).replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
    return '<div style="display:flex;align-items:center;gap:12px;min-width:0;text-align:left">'
      + '<ha-icon icon="mdi:television" style="--mdc-icon-size:26px;color:' + (off ? '${C.muted}' : '${C.onText}') + ';flex:none"></ha-icon>'
      + '<div style="min-width:0"><div style="font-size:17px;font-weight:600;color:${C.text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(${JSON.stringify(name)}) + '</div>'
      + '<div style="font-size:13px;color:${C.muted};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(status) + '</div></div></div>';
  ]]]`;
  fields.power = {card: {
    ...key('Power', 'mdi:power', player('toggle')), entity: id, triggers_update: [],
    styles: {...key('Power', 'mdi:power').styles, card: [
      {background: `[[[ return ['off','standby','unavailable','unknown'].includes(entity?.state) ? 'linear-gradient(135deg,${C.surface},${C.surfaceEnd})' : 'linear-gradient(135deg,${C.onBg},${C.surfaceEnd})'; ]]]`},
      {border: `[[[ return ['off','standby','unavailable','unknown'].includes(entity?.state) ? '1px solid ${C.line}' : '1px solid ${C.on}'; ]]]`},
      {'border-radius': '50%'}, {'box-shadow': 'none'}, {width: '44px'}, {height: '44px'}, {padding: '0'}]}
  }};

  if (remote) {
    areas.push('"pad pad side"');
    const arrow = (dir, icon) => key(dir[0].toUpperCase() + dir.slice(1), icon, send(c[dir]), {round: true, size: 26, hold: send(c[dir], {num_repeats: 5})});
    fields.pad = {card: group('". up ." "left ok right" ". down ."', '1fr 1fr 1fr', {
      up: arrow('up', 'mdi:chevron-up'), left: arrow('left', 'mdi:chevron-left'), right: arrow('right', 'mdi:chevron-right'), down: arrow('down', 'mdi:chevron-down'),
      ok: {...key('OK', 'mdi:circle-medium', send(c.ok), {hold: send(c.ok, {hold_secs: 0.6})}),
        styles: {...key('OK').styles, card: [{background: `linear-gradient(135deg,${C.surface},${C.card})`}, {border: `1px solid ${C.line}`}, {'border-radius': '50%'}, {'box-shadow': 'none'}, {height: '56px'}, {width: '56px'}, {margin: 'auto'}]}}
    }, {card: [{background: `radial-gradient(circle at 50% 45%,${C.surface} 0 62%,transparent 63%)`}, {padding: '10px'}, {'max-width': '220px'}, {margin: '0 auto'}],
      grid: [{'align-items': 'center'}, {'justify-items': 'center'}]})};
    fields.side = {card: group('"back" "home" "menu"', '1fr', {
      back: key('Back', 'mdi:arrow-left', send(c.back), {label: true}),
      home: key('Home', 'mdi:home-outline', send(c.home), {label: true}),
      menu: key('Menu', 'mdi:menu', send(c.menu), {label: true})
    }, {grid: [{'align-content': 'center'}]})};
  }

  // Volume and playback, plus the keyboard where the integration can type text.
  const media = {
    down: key('Volume down', 'mdi:volume-minus', remote ? send(c.volumeDown) : player('volume_down'), {hold: remote ? send(c.volumeDown, {num_repeats: 5}) : undefined}),
    ...(remote && c.mute ? {mute: key('Mute', 'mdi:volume-off', send(c.mute))} : {}),
    play: key('Play or pause', 'mdi:play-pause', remote ? send(c.playPause) : player('media_play_pause')),
    up: key('Volume up', 'mdi:volume-plus', remote ? send(c.volumeUp) : player('volume_up'), {hold: remote ? send(c.volumeUp, {num_repeats: 5}) : undefined}),
    ...(remote && c.keyboard ? {keys: key('Keyboard', 'mdi:keyboard-outline', {action: 'fire-dom-event', browser_mod: {service: 'browser_mod.popup', data: {
      title: `Type on ${name}`,
      content: [{name: 'command', label: 'Text', selector: {text: {}}}],
      right_button: 'Send', right_button_action: {service: 'remote.send_command', data: {entity_id: remote.id}},
      left_button: 'Close'
    }}})} : {})
  };
  const mediaKeys = Object.keys(media);
  areas.push(`"media media media"`);
  fields.media = {card: group(`"${mediaKeys.join(' ')}"`, `repeat(${mediaKeys.length},1fr)`, media)};

  const apps = tvApps(id, hass, remote);
  if (apps.length) {
    areas.push('"apps apps apps"');
    const chips = Object.fromEntries(apps.map((app, index) => {
      const chip = key(app.name, APP_ICONS.find(([pattern]) => pattern.test(app.name))?.[1] || 'mdi:application-outline',
        app.kind === 'activity' ? {action: 'perform-action', perform_action: 'remote.turn_on', target: {entity_id: remote.id}, data: {activity: app.name}}
          : player('select_source', {source: app.name}), {label: true, size: 26});
      const active = `[[[ ${current} const cur = r?.attributes?.current_activity || m?.attributes?.source || m?.attributes?.app_name; return cur === ${JSON.stringify(app.name)}`;
      chip.triggers_update = watched;
      chip.styles.card = [{background: `${active} ? 'linear-gradient(135deg,${C.onBg},${C.surfaceEnd})' : 'linear-gradient(135deg,${C.surface},${C.surfaceEnd})'; ]]]`},
        {border: `${active} ? '1px solid ${C.on}' : '1px solid ${C.line}'; ]]]`},
        {'border-radius': '12px'}, {'box-shadow': 'none'}, {padding: '10px 4px 8px'}];
      chip.styles.name = [{'font-size': '12px'}, {color: C.text}, {'white-space': 'nowrap'}, {overflow: 'hidden'}, {'text-overflow': 'ellipsis'}, {'max-width': '100%'}];
      return [`a${index}`, chip];
    }));
    // Rows of four, so every app and input stays visible.
    const names = Object.keys(chips);
    const rows = [];
    for (let i = 0; i < names.length; i += 4) rows.push(`"${[...names.slice(i, i + 4), '.', '.', '.'].slice(0, 4).join(' ')}"`);
    fields.apps = {card: group(rows.join(' '), 'repeat(4,minmax(0,1fr))', chips)};
  }

  return {
    type: 'custom:button-card', entity: id, show_name: false, show_icon: false, show_state: false,
    tap_action: {action: 'none'}, hold_action: {action: 'more-info'}, triggers_update: watched,
    grid_options: {columns: 12, rows: 'auto'},
    custom_fields: fields,
    styles: {
      card: [{padding: '14px'}, {'border-radius': '20px'}, {border: `1px solid ${C.line}`}, {overflow: 'hidden'},
        {background: `[[[ const p = entity?.attributes?.entity_picture; return entity?.state === 'playing' && p ? 'linear-gradient(180deg,rgba(10,20,32,.72),rgba(10,20,32,.94) 55%),url("' + p + '") center/cover' : 'linear-gradient(160deg,${C.surface},${C.card})'; ]]]`}],
      grid: [{'grid-template-areas': areas.join(' ')}, {'grid-template-columns': '1fr 1fr 76px'}, {gap: '14px 10px'}, {'align-items': 'center'}],
      custom_fields: {head: [{'justify-self': 'stretch'}, {'min-width': '0'}], power: [{'justify-self': 'end'}],
        pad: [{'justify-self': 'stretch'}], side: [{'align-self': 'stretch'}], media: [{'justify-self': 'stretch'}],
        apps: [{'justify-self': 'stretch'}, {'min-width': '0'}, {overflow: 'hidden'}]}
    }
  };
}
