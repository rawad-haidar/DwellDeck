// Dashboard strategy and custom element registration.
import {discoveryContext} from './discovery.mjs';
import {generateOriginal} from './generator.mjs';
import {kidFor, kidsDashboard} from './kids.mjs';
import {loadDwellFont, refreshText} from './design.mjs';
import {DwellDeckOriginalEditor} from './editor.mjs';
import {dwellTabsCss, dwellPageCss, DEFAULT_PALETTE} from './theme.mjs';
import {ORIGINAL_TEMPLATE, SLOTS, ROOM_TEMPLATES} from './data.mjs';

// Keeps DwellDeck's page colours and tab style in Home Assistant's dashboard root (the only place a style
// reaches every view and the tab bar) and its page colour on the browser page while a DwellDeck dashboard is
// open, and takes them away on other dashboards. Reaches the root directly (no page-wide search), twice a second.
function keepDwellPage(css) {
  if (typeof document === 'undefined' || typeof location === 'undefined') return;
  const state = window.__dwellTabs ||= {paths: {}, timer: null};
  state.paths[`/${location.pathname.split('/')[1] || ''}`] = css;
  if (state.timer) return;
  const put = (parent, id, text) => {
    let style = parent.querySelector(`#${id}`);
    if (!text) { style?.remove(); return; }
    if (!style) { style = document.createElement('style'); style.id = id; parent.append(style); }
    if (style.textContent !== text) style.textContent = text;
  };
  state.timer = setInterval(() => {
    const panel = document.querySelector('home-assistant')?.shadowRoot?.querySelector('home-assistant-main')?.shadowRoot?.querySelector('ha-panel-lovelace');
    const root = panel?.shadowRoot?.querySelector('hui-root')?.shadowRoot;
    const wanted = panel ? state.paths[`/${panel.panel?.url_path || location.pathname.split('/')[1] || ''}`] : null;
    put(document.head, 'dwelldeck-page', wanted?.page);
    // browser_mod draws popups in Home Assistant's own shell, outside the dashboard.
    const shell = document.querySelector('home-assistant')?.shadowRoot;
    if (shell) put(shell, 'dwelldeck-popup', wanted?.popup);
    if (root) { put(root, 'dwelldeck-tabs', wanted?.tabs); put(root, 'dwelldeck-root', wanted?.root); put(root, 'dwelldeck-view', wanted?.view); }
  }, 500);
}

// Switches the lights an "All on" / "All off" button (or a room card's lights button) names, one at a time:
// lights already that way or unreachable are left alone; each other light gets its own command, the next goes
// when the hub has confirmed the last one (or after 1.2 s), 250 ms apart. A few seconds after the last one,
// only a light that is really not on (or off) is named in a message.
// Which All on / All off run touched each light last. A newer run takes the light over:
// the older one stops sending to it and does not report it (pressing All off right after All on is not a failure).
const lightRuns = new Map();
let lightRun = 0;
export async function dwellSwitchLights({service, entity_id: ids}, hass, notify, wait = ms => new Promise(r => setTimeout(r, ms))) {
  if (!['turn_on', 'turn_off'].includes(service) || !Array.isArray(ids) || !hass?.callService) return [];
  const want = service === 'turn_on' ? 'on' : 'off';
  const run = ++lightRun;
  const mine = id => lightRuns.get(id) === run;
  const now = () => (typeof document !== 'undefined' && document.querySelector('home-assistant')?.hass?.states) || hass.states || {};
  const todo = ids.filter(id => { const state = now()[id]?.state; return state && !['unavailable', 'unknown'].includes(state) && state !== want; });
  for (const id of ids) lightRuns.set(id, run);
  for (const id of todo) {
    if (!mine(id)) continue;
    await Promise.race([hass.callService(id.split('.')[0], service, {entity_id: id}).catch(() => {}), wait(1200)]);
    await wait(250);
  }
  if (!todo.length) { for (const id of ids) if (mine(id)) lightRuns.delete(id); return []; }
  await wait(4000);
  const states = now();
  const left = todo.filter(id => mine(id) && states[id] && states[id].state !== 'unavailable' && states[id].state !== want);
  for (const id of todo) if (mine(id)) lightRuns.delete(id);
  if (left.length) notify(`${left.length === 1 ? '1 light' : left.length + ' lights'} did not turn ${want}: ${[...new Set(left.map(id => states[id].attributes?.friendly_name || id))].join(', ')}`);
  return left;
}
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function' && !window.__dwellLights) {
  window.__dwellLights = true;
  window.addEventListener('ll-custom', event => {
    const request = event.detail?.dwelldeck_lights;
    if (!request) return;
    const shell = document.querySelector('home-assistant');
    const notify = message => shell?.dispatchEvent(new CustomEvent('hass-notification', {detail: {message}, bubbles: true, composed: true}));
    dwellSwitchLights(request, shell?.hass, notify);
  });
}

class DwellDeckOriginalStrategy extends HTMLElement {
  static configRequired=true;
  static getConfigElement(){return document.createElement('dwelldeck-original-editor');}
  static getCreateSuggestions(){return {title:'DwellDeck',icon:'mdi:view-dashboard'};}
  static async generate(config, hass) {
    loadDwellFont(config);
    const palette = config.color_palette || DEFAULT_PALETTE;
    const page = dwellPageCss(palette);
    // The same design pass as the cards' own text (corner radii, text sizes).
    page.view = refreshText(page.view);
    page.popup = refreshText(page.popup);
    // Without DwellDeck's own colours (a theme chosen instead), cards keep the theme's.
    if (config.theme || config.builtin_colors === false) page.view = page.popup = '';
    keepDwellPage({...page, tabs: config.modern_tabs !== false ? dwellTabsCss(palette) : ''});
    // A kid's account gets only their own rooms (see kids.mjs). Registries may be admin-only on some
    // Home Assistant versions, so fall back to the ones every signed-in user already has.
    const kid = kidFor(config, hass.user);
    if (kid) return kidsDashboard(config, await discoveryContext(hass).catch(() => hass), kid);
    const needsDiscovery = config.auto_discover || config.room_controls ||
      Object.values(config.rooms || {}).some(room => room.area) ||
      (config.extra_rooms || []).some(room => room.area);
    // Camera detection only uses the registries to link sensors to cameras on the same device.
    // If any registry cannot be read (older Home Assistant has no floors or labels), match camera names instead.
    const context = needsDiscovery ? await discoveryContext(hass)
      : config.camera_detection !== false ? await discoveryContext(hass).catch(() => hass) : hass;
    return generateOriginal(ORIGINAL_TEMPLATE, SLOTS, ROOM_TEMPLATES, config, context);
  }
}
// Shows which build is loaded, so a cached old file is easy to spot in the browser console.
if(typeof DWELLDECK_VERSION!=='undefined'&&typeof console!=='undefined'&&!window.__dwelldeckLogged){window.__dwelldeckLogged=true;console.info(`%c DwellDeck ${DWELLDECK_VERSION} `,'background:#f2b950;color:#141a22;font-weight:700;border-radius:4px');}
if(!customElements.get('dwelldeck-original-editor'))customElements.define('dwelldeck-original-editor',DwellDeckOriginalEditor);
if(!customElements.get('ll-strategy-dashboard-dwelldeck-original'))customElements.define('ll-strategy-dashboard-dwelldeck-original',DwellDeckOriginalStrategy);
window.customStrategies=window.customStrategies||[];
if(!window.customStrategies.some(s=>s.type==='dwelldeck-original'))window.customStrategies.push({type:'dwelldeck-original',strategyType:'dashboard',name:'DwellDeck · Original design',description:`The original Home page, navigation, styled cards and room popups with visual entity setup.${typeof DWELLDECK_VERSION!=='undefined'?' Version '+DWELLDECK_VERSION+'.':''}`});
