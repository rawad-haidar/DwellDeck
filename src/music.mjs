// Music Assistant page: the Music Assistant app takes DwellDeck's colours and font. The app is served by
// Home Assistant on the same address (add-on ingress), so the dashboard can add a stylesheet to it.
import {DWELL_FONT_URL, DWELL_FONT_STACK} from './design.mjs';
import {KNOWN_PACKAGES, HIDDEN_PACKAGES} from './tv.mjs';
import {ROOM_COLORS} from './rooms.mjs';

// Runs inside a button-card template (`card` is the button-card element). Reads the dashboard's colours
// from the page and keeps a stylesheet in the Music Assistant app, again after every reload.
// Self-contained: serialised with toString.
function dwellMaTheme(card, cfg) {
  const deep = root => { for (const node of root.querySelectorAll('*')) { if (node.tagName === 'IFRAME' && /hassio_ingress|music/i.test(node.src)) return node;
    const hit = node.shadowRoot && deep(node.shadowRoot); if (hit) return hit; } return null; };
  let frame = null, waiting = 0;
  // The app starts hidden (see the page's style) and shows once it has DwellDeck's colours, so its own
  // colours never flash. After 3 s it shows anyway.
  const show = () => { if (frame) frame.style.opacity = '1'; };
  const apply = () => {
    if (!card?.isConnected) return false;
    if (!frame?.isConnected) frame = deep(document);
    let doc;
    try { doc = frame?.contentDocument; } catch (e) { show(); return true; }
    if (!doc) return true;
    if (doc.getElementById('dwelldeck-theme')) { show(); waiting = 0; return true; }
    if (frame.style.opacity !== '0' && !waiting) { frame.style.opacity = '0'; }
    waiting += 1;
    if (waiting > 30) { show(); }
    if (!doc.head) return true;
    const look = name => getComputedStyle(card).getPropertyValue(name).trim();
    // "r,g,b" for Music Assistant's colour settings, from any CSS colour.
    const rgb = (value, fallback) => {
      const probe = document.createElement('span');
      probe.style.color = value || fallback;
      document.body.appendChild(probe);
      const out = getComputedStyle(probe).color.match(/\d+(\.\d+)?/g) || [];
      probe.remove();
      return out.slice(0, 3).join(',');
    };
    const c = {
      bg: rgb(look('--primary-background-color'), cfg.bg), surface: rgb(look('--card-background-color'), cfg.surface),
      light: rgb(look('--secondary-background-color'), cfg.light), primary: rgb(look('--primary-color'), cfg.primary),
      secondary: rgb(look('--accent-color'), cfg.secondary), text: rgb(look('--primary-text-color'), cfg.text),
      muted: rgb(look('--secondary-text-color'), cfg.muted)
    };
    const col = (v, a) => a === undefined ? `rgb(${v})` : `rgba(${v},${a})`;
    // The dashboard's font too, unless it is switched off in setup.
    const font = doc.createElement('link');
    if (cfg.font) Object.assign(font, {rel: 'stylesheet', href: cfg.font});
    const style = doc.createElement('style');
    style.id = 'dwelldeck-theme';
    style.textContent = `
      /* Older parts of the app (Vuetify): colours as "r,g,b". */
      .v-theme--dark, .v-theme--light {
        --v-theme-background: ${c.bg}; --v-theme-surface: ${c.surface}; --v-theme-surface-light: ${c.light};
        --v-theme-overlay: ${c.surface}; --v-theme-primary: ${c.primary}; --v-theme-secondary: ${c.secondary};
        --v-theme-on-background: ${c.text}; --v-theme-on-surface: ${c.text}; --v-theme-fg: ${c.text};
      }
      /* Newer parts (sidebar, cards, menus): plain colours. html.dark outranks the app's own .dark. */
      html.dark, html {
        --background: ${col(c.bg)}; --foreground: ${col(c.text)};
        --card: ${col(c.surface)}; --card-foreground: ${col(c.text)};
        --popover: ${col(c.surface)}; --popover-foreground: ${col(c.text)};
        --primary: ${col(c.primary)}; --primary-foreground: ${col(c.bg)};
        --secondary: ${col(c.light)}; --secondary-foreground: ${col(c.text)};
        --muted: ${col(c.light)}; --muted-foreground: ${col(c.muted)};
        --accent: ${col(c.light)}; --accent-foreground: ${col(c.text)};
        --border: ${col(c.text, 0.12)}; --input: ${col(c.text, 0.12)}; --ring: ${col(c.primary)};
        --sidebar: ${col(c.surface)}; --sidebar-foreground: ${col(c.text)};
        --sidebar-primary: ${col(c.primary)}; --sidebar-primary-foreground: ${col(c.bg)};
        --sidebar-accent: ${col(c.text, 0.08)}; --sidebar-accent-foreground: ${col(c.text)};
        --sidebar-border: ${col(c.text, 0.12)}; --sidebar-ring: ${col(c.primary)};
      }
      html, body, .v-application, .v-main { background: rgb(${c.bg}) !important; }
      ${cfg.family ? `body, .v-application { font-family: ${cfg.family} !important; }` : ''}
      .v-card, .v-sheet, .v-list, .v-navigation-drawer, .v-toolbar, .v-app-bar, .v-footer { background-color: rgb(${c.surface}) !important; }
      .v-card { border-radius: 16px; }
    `;
    doc.head.append(...(cfg.font ? [font] : []), style);
    waiting = 0;
    requestAnimationFrame(show);
    return true;
  };
  // Checked ten times a second while this page is open, so a reload (a room's player chosen) is caught
  // as soon as the new page starts.
  clearInterval(window.__dwellMaThemeTimer);
  window.__dwellMaThemeTimer = setInterval(() => { if (!card?.isConnected) clearInterval(window.__dwellMaThemeTimer); else apply(); }, 100);
  setTimeout(apply, 0);
  return '';
}

export function designMusic(output, config = {}) {
  const view = output.views.find(item => item.path === 'music-assistant');
  const app = view?.cards?.find(card => card.type === 'custom:addon-iframe-card');
  if (!app) return output;
  const helper = {
    type: 'custom:button-card', show_name: false, show_icon: false, show_state: false, show_label: false,
    tap_action: {action: 'none'}, hold_action: {action: 'none'}, variables: {dwell_static: true},
    // Fallbacks in DwellDeck's colours (recoloured with the palette like every other card).
    custom_fields: {theme: `[[[ return (${dwellMaTheme.toString()})(this, ${JSON.stringify({font: config.font === 'system' ? '' : DWELL_FONT_URL, family: config.font === 'system' ? '' : DWELL_FONT_STACK,
      bg: '#080e18', surface: '#162536', light: '#111d2b', primary: '#29d5ee', secondary: '#39e2bc', text: '#edf5ff', muted: '#91a8bd'})}); ]]]`},
    styles: {card: [{height: '0'}, {padding: '0'}, {border: 'none'}, {background: 'none'}, {'box-shadow': 'none'}, {overflow: 'hidden'}],
      grid: [{'grid-template-areas': '"theme"'}]},
    // Takes no room on the page.
    extra_styles: ':host{display:block;height:0;overflow:hidden;margin-bottom:-8px}'
  };
  // The app is hidden until it has DwellDeck's colours (the helper shows it, or after 3 s).
  const hide = 'iframe { opacity: 0; transition: opacity .25s ease; }';
  app.card_mod = {...(app.card_mod || {}), style: typeof app.card_mod?.style === 'string' ? `${app.card_mod.style}\n${hide}` : hide};
  view.cards = [{type: 'vertical-stack', cards: [helper, app]}, ...view.cards.filter(card => card !== app)];
  return output;
}

// Media page: "Recently played", what each TV and sound system played, from Home Assistant's history.
// Runs inside a button-card template (`card` is the button-card element). Self-contained: serialised with toString.
function dwellPlayed(card, hass, cfg) {
  const all = window.__dwellPlayed = window.__dwellPlayed || {};
  const store = (() => { try { return window.localStorage; } catch (e) { return null; } })();
  const st = all.s = all.s || {range: store?.getItem('dwelldeck-played-range') || 'today', player: store?.getItem('dwelldeck-played-player') || '',
    data: null, loading: false, asked: '', limit: 60};
  const RANGES = [['today', 'Today'], ['yesterday', 'Yesterday'], ['3d', 'Last 3 days'], ['7d', 'Last week'], ['10d', 'Last 10 days']];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
  const day0 = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const span = () => {
    const now = new Date(), today = day0(now);
    if (st.range === 'today') return [today, now];
    if (st.range === 'yesterday') return [new Date(+today - 86400000), today];
    const days = Number.parseInt(st.range, 10) || 1;
    return [new Date(+today - (days - 1) * 86400000), now];
  };
  // App names as on the cards: known packages by name, the launcher is "Home", package ids shortened.
  const nice = value => {
    if (!value) return '';
    const text = String(value).trim();
    if (cfg.known[text]) return cfg.known[text];
    if (/launcher/i.test(text)) return 'Home';
    if (/music assistant/i.test(text)) return 'Music Assistant';
    if (!/^[a-z][\w]*(\.[\w:]+)+$/i.test(text)) return text;
    const part = text.split(/[.:]/).filter(w => !/^(com|net|org|tv|android|androidtv|google|app|apps|mobile|ninja|livingroom|leanback)$/i.test(w)).pop() || text;
    return part.charAt(0).toUpperCase() + part.slice(1);
  };
  const OFF = ['off', 'standby', 'unavailable', 'unknown'];
  // One player's history as sessions: something with a title playing, or a TV app open (not the home screen).
  const sessions = (player, res, from, to) => {
    const out = [];
    for (const id of player.ids) {
      let attrs = {};
      const items = (res[id] || []).map(item => {
        attrs = item.a || item.attributes || attrs;
        const t = item.lu !== undefined ? item.lu * 1000 : item.lc !== undefined ? item.lc * 1000 : Date.parse(item.last_updated || item.last_changed);
        return {t: Math.max(+from, t), state: item.s ?? item.state, a: attrs};
      }).filter(row => Number.isFinite(row.t));
      items.forEach((row, i) => {
        const end = i + 1 < items.length ? items[i + 1].t : +to;
        if (OFF.includes(row.state) || end <= row.t) return;
        const a = row.a || {};
        // Amplifier zones put their input in the title ("AUX1", "DVD", "Music Assistant"): that is no title.
        const inputs = [a.source, ...(a.source_list || []), 'Music Assistant', 'Home Assistant'].filter(Boolean).map(v => String(v).toLowerCase());
        const title = a.media_title && !inputs.includes(String(a.media_title).toLowerCase()) ? a.media_title : '';
        const detail = [a.media_series_title, a.media_artist, a.media_album_name].filter(Boolean).filter((v, n, list) => list.indexOf(v) === n).join(', ');
        // System apps (voice search, the launcher's helpers) are not something played.
        const hidden = new RegExp(cfg.hidden, 'i');
        const named = [a.app_name, a.app_id].filter(v => v && !(hidden.test(v) && !/launcher/i.test(v))).map(nice).find(Boolean) || '';
        const app = named || (a.source && !hidden.test(a.source) ? nice(a.source) : '');
        const playing = ['playing', 'paused', 'buffering'].includes(row.state);
        // Without a title, only a real app counts: not the home screen, settings, the store, or a Music
        // Assistant player that sits paused with nothing in its queue.
        if (!title && (!app || cfg.notPlayed.includes(app))) return;
        if (!title && !named && row.state !== 'playing') return;
        if (!(playing && (title || app)) && !named) return;
        const key = `${title}|${detail}|${title ? '' : app}`;
        const last = out.at(-1);
        if (last && last.id === id && last.key === key && row.t - last.end < 180000) { last.end = end; if (row.state === 'playing') last.played = true; return; }
        out.push({id, key, title, detail, app, named: !!named, start: row.t, end, played: row.state === 'playing', player: player.name});
      });
    }
    // The same thing seen on two entries of one player (the zone and its Music Assistant copy) counts once;
    // an app with nothing named is dropped while something named plays on the same player.
    out.sort((x, y) => x.start - y.start);
    const kept = [];
    for (const item of out) {
      const same = k => item.title ? k.title === item.title : k.key === item.key;
      const twin = kept.find(k => same(k) && item.start <= k.end + 60000 && item.end >= k.start - 60000);
      if (twin) {
        twin.start = Math.min(twin.start, item.start); twin.end = Math.max(twin.end, item.end); twin.played ||= item.played;
        if (item.detail.length > twin.detail.length) twin.detail = item.detail;
        // An app's own name ("Music Assistant") beats an input name ("Internet music").
        if (!twin.app || (item.named && !twin.named)) Object.assign(twin, {app: item.app, named: item.named});
        continue;
      }
      kept.push(item);
    }
    return kept.filter(item => item.title || !kept.some(k => k.title && k.start < item.end && k.end > item.start))
      .filter(item => item.end - item.start >= 30000 && (item.played || !item.title || item.end - item.start >= 60000));
  };
  const draw = () => { const t = card?.shadowRoot?.querySelector('.plx'); if (t) t.outerHTML = render(); };
  const load = async () => {
    const [from, to] = span();
    const asked = `${st.range}|${Math.floor(Date.now() / 120000)}`;
    if (st.loading || st.asked === asked) return;
    Object.assign(st, {loading: true, asked});
    if (st.data) draw();
    try {
      const ids = [...new Set(cfg.players.flatMap(player => player.ids))];
      const res = await hass.callWS({type: 'history/history_during_period', start_time: from.toISOString(), end_time: to.toISOString(),
        entity_ids: ids, minimal_response: false, no_attributes: false, significant_changes_only: false});
      st.data = {rows: cfg.players.flatMap(player => sessions(player, res, from, to)).sort((x, y) => y.start - x.start), error: ''};
    } catch (e) {
      st.data = {rows: [], error: 'Could not read the history: ' + (e?.message || e?.code || 'unknown error')};
    }
    st.loading = false;
    draw();
  };
  window.__dwellPlayedLoad = load;
  window.__dwellPlayedDraw = draw;
  window.__dwellPlayedUi = window.__dwellPlayedUi || {
    save(key, value) { try { window.localStorage.setItem(key, value); } catch (e) { /* private mode */ } },
    range(el) { const s = window.__dwellPlayed.s; s.range = el.value; s.asked = ''; s.limit = 60; this.save('dwelldeck-played-range', el.value); window.__dwellPlayedLoad(); },
    player(el) { const s = window.__dwellPlayed.s; s.player = el.value ?? el.dataset.player; s.limit = 60; this.save('dwelldeck-played-player', s.player); window.__dwellPlayedDraw(); },
    more() { window.__dwellPlayed.s.limit += 60; window.__dwellPlayedDraw(); }
  };
  const time = t => new Date(t).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
  const length = ms => { const m = Math.round(ms / 60000); return m < 1 ? 'under a minute' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`; };
  const dayName = t => {
    const today = +day0(new Date()), d = +day0(t);
    return d === today ? 'Today' : d === today - 86400000 ? 'Yesterday' : new Date(t).toLocaleDateString([], {weekday: 'long', day: 'numeric', month: 'long'});
  };
  const render = () => {
    const names = cfg.players.map(p => p.name);
    const player = names.includes(st.player) ? st.player : '';
    const bar = `<div class="pb"><select aria-label="Dates" onchange="event.stopPropagation();window.__dwellPlayedUi.range(this)">${RANGES.map(([v, l]) => `<option value="${v}"${v === st.range ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <select aria-label="Player" onchange="event.stopPropagation();window.__dwellPlayedUi.player(this)"><option value="">All players</option>${names.map(n => `<option value="${esc(n)}"${n === player ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>
      ${st.loading && st.data ? '<span class="busy">Updating…</span>' : ''}</div>`;
    if (!st.data) return `<div class="plx">${bar}<div class="msg">Reading the history…</div></div>`;
    if (st.data.error) return `<div class="plx">${bar}<div class="msg">${esc(st.data.error)}</div></div>`;
    const rows = st.data.rows.filter(row => !player || row.player === player);
    if (!rows.length) return `<div class="plx">${bar}<div class="msg">Nothing played${player ? ` on ${esc(player)}` : ''} in this time.</div></div>`;
    let lastDay = '';
    const list = rows.slice(0, st.limit).map(row => {
      const d = dayName(row.start);
      const head = d !== lastDay ? `<div class="dy">${esc(d)}</div>` : '';
      lastDay = d;
      const what = row.title ? `<div class="tt">${esc(row.title)}</div>${row.detail ? `<div class="dt">${esc(row.detail)}</div>` : ''}` : `<div class="tt">${esc(row.app)}</div>`;
      const live = row.end >= Date.now() - 90000 && st.range !== 'yesterday';
      return `${head}<div class="it"><div class="tm">${time(row.start)}<span>${live ? 'now' : time(row.end)}</span></div>
        <div class="wh">${what}<div class="mt">${player ? '' : `<button class="pl" data-player="${esc(row.player)}" onclick="event.stopPropagation();window.__dwellPlayedUi.player(this)">${esc(row.player)}</button>`}${row.title && row.app ? `<span class="ap">${esc(row.app)}</span>` : ''}<span>${live ? 'playing now' : length(row.end - row.start)}</span></div></div></div>`;
    }).join('');
    const more = rows.length > st.limit ? `<button class="more" onclick="event.stopPropagation();window.__dwellPlayedUi.more()">Show ${Math.min(60, rows.length - st.limit)} more</button>` : '';
    return `<div class="plx">${bar}<div class="ls">${list}</div>${more}</div>`;
  };
  const c = cfg.c;
  const style = `<style>
    .plx{display:flex;flex-direction:column;gap:12px;width:100%;text-align:left;color:${c.text};font-size:14px}
    .pb{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
    .pb select{height:36px;padding:0 10px;border-radius:10px;border:1px solid ${c.line};background:${c.card};color:${c.text};font:inherit;font-size:14px}
    .busy{font-size:12px;color:${c.muted}}
    .ls{display:flex;flex-direction:column}
    .dy{margin:14px 0 4px;font-size:12.5px;font-weight:600;color:${c.muted}}.dy:first-child{margin-top:0}
    .it{display:grid;grid-template-columns:64px 1fr;gap:12px;padding:10px 0;border-top:1px solid ${c.line}}
    .dy+.it{border-top:none}
    .tm{font-size:13px;font-variant-numeric:tabular-nums;color:${c.text}}.tm span{display:block;color:${c.muted}}
    .wh{min-width:0}.tt{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .dt{font-size:13px;color:${c.muted};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .mt{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;margin-top:4px;font-size:12.5px;color:${c.muted}}
    .pl{padding:2px 9px;border-radius:999px;border:1px solid ${c.line};background:none;color:${c.onText};font:inherit;font-size:12.5px;cursor:pointer}
    .pl:hover{border-color:${c.on}}.pl:focus-visible,.more:focus-visible,.pb select:focus-visible{outline:2px solid ${c.on};outline-offset:2px}
    .ap{color:${c.text}}
    .more{align-self:center;height:36px;padding:0 16px;border-radius:10px;border:1px solid ${c.line};background:none;color:${c.text};font:inherit;cursor:pointer}
    .msg{padding:24px;text-align:center;color:${c.muted}}
  </style>`;
  if (hass?.callWS) setTimeout(() => load(), 0);
  return style + render();
}

// The Media page ends with "Recently played" for every TV and sound system card on it.
export function designMediaHistory(output, {hass = {}} = {}) {
  const view = output.views.find(item => item.path === 'media');
  if (!view?.sections?.length) return output;
  const players = [];
  for (const card of view.sections.flatMap(section => section.cards || [])) {
    if (card.type !== 'custom:button-card' || !card.custom_fields?.now || !card.entity?.startsWith('media_player.')) continue;
    // DLNA renderers keep an old title playing for hours after it stopped, so they are left out.
    const ids = [...new Set([card.entity, ...(card.triggers_update || [])].filter(id => typeof id === 'string' && id.startsWith('media_player.')
      && hass.entities?.[id]?.platform !== 'dlna_dmr'))];
    if (!ids.length) continue;
    if (!players.some(player => player.ids[0] === ids[0])) players.push({name: String(card.name || card.entity).replace(/[<>&"]/g, ''), ids});
  }
  if (!players.length) return output;
  const c = {text: ROOM_COLORS.text, muted: ROOM_COLORS.muted, line: ROOM_COLORS.line, card: ROOM_COLORS.card, on: ROOM_COLORS.on, onText: ROOM_COLORS.onText};
  view.sections.push({type: 'grid', column_span: 4, cards: [
    {type: 'heading', heading: 'Recently played', icon: 'mdi:history'},
    {type: 'custom:button-card', show_name: false, show_icon: false, show_state: false, show_label: false,
      tap_action: {action: 'none'}, hold_action: {action: 'none'}, variables: {dwell_static: true},
      custom_fields: {played: `[[[ return (${dwellPlayed.toString()})(this, hass, ${JSON.stringify({players, known: {...KNOWN_PACKAGES, ShahidTV: 'Shahid'}, hidden: `${HIDDEN_PACKAGES.source}|ttvs|service\\b|\\}`,
        notPlayed: ['Home', 'Settings', 'Play Store', 'Music Assistant', 'Google Cast'], c})}); ]]]`},
      styles: {
        card: [{padding: '16px'}, {'border-radius': '20px'}, {background: `linear-gradient(135deg,${ROOM_COLORS.surface},${ROOM_COLORS.card})`}, {border: `1px solid ${ROOM_COLORS.line}`}, {'box-shadow': 'none'}, {cursor: 'default'}],
        grid: [{'grid-template-areas': '"played"'}, {'grid-template-columns': '1fr'}],
        custom_fields: {played: [{width: '100%'}, {'min-width': '0'}, {'pointer-events': 'auto'}]}
      },
      grid_options: {columns: 'full', rows: 'auto'}}
  ]});
  return output;
}
