// Dashboard strategy and custom element registration.
import {discoveryContext} from './discovery.mjs';
import {generateOriginal} from './generator.mjs';
import {loadDwellFont} from './design.mjs';
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
    if (root) { put(root, 'dwelldeck-tabs', wanted?.tabs); put(root, 'dwelldeck-root', wanted?.root); }
  }, 500);
}

class DwellDeckOriginalStrategy extends HTMLElement {
  static configRequired=true;
  static getConfigElement(){return document.createElement('dwelldeck-original-editor');}
  static getCreateSuggestions(){return {title:'DwellDeck',icon:'mdi:view-dashboard'};}
  static async generate(config, hass) {
    loadDwellFont(config);
    const palette = config.color_palette || DEFAULT_PALETTE;
    keepDwellPage({...dwellPageCss(palette), tabs: config.modern_tabs !== false ? dwellTabsCss(palette) : ''});
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
