// Music Assistant page: the Music Assistant app takes DwellDeck's colours and font. The app is served by
// Home Assistant on the same address (add-on ingress), so the dashboard can add a stylesheet to it.
import {DWELL_FONT_URL, DWELL_FONT_STACK} from './design.mjs';

// Runs inside a button-card template (`card` is the button-card element). Reads the dashboard's colours
// from the page and keeps a stylesheet in the Music Assistant app, again after every reload.
// Self-contained: serialised with toString.
function dwellMaTheme(card, cfg) {
  const apply = () => {
    if (!card?.isConnected) return false;
    const deep = root => { for (const node of root.querySelectorAll('*')) { if (node.tagName === 'IFRAME' && /hassio_ingress|music/i.test(node.src)) return node;
      const hit = node.shadowRoot && deep(node.shadowRoot); if (hit) return hit; } return null; };
    const frame = deep(document);
    let doc;
    try { doc = frame?.contentDocument; } catch (e) { return true; }
    if (!doc?.head || doc.getElementById('dwelldeck-theme')) return true;
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
      secondary: rgb(look('--accent-color'), cfg.secondary), text: rgb(look('--primary-text-color'), cfg.text)
    };
    // The dashboard's font too, unless it is switched off in setup.
    const font = doc.createElement('link');
    if (cfg.font) Object.assign(font, {rel: 'stylesheet', href: cfg.font});
    const style = doc.createElement('style');
    style.id = 'dwelldeck-theme';
    style.textContent = `
      .v-theme--dark, .v-theme--light {
        --v-theme-background: ${c.bg}; --v-theme-surface: ${c.surface}; --v-theme-surface-light: ${c.light};
        --v-theme-primary: ${c.primary}; --v-theme-secondary: ${c.secondary};
        --v-theme-on-background: ${c.text}; --v-theme-on-surface: ${c.text}; --v-theme-fg: ${c.text};
      }
      html, body, .v-application, .v-main { background: rgb(${c.bg}) !important; }
      ${cfg.family ? `body, .v-application { font-family: ${cfg.family} !important; }` : ''}
      .v-card, .v-sheet, .v-list, .v-navigation-drawer, .v-toolbar, .v-app-bar, .v-footer { background-color: rgb(${c.surface}) !important; }
      .v-card { border-radius: 16px; }
    `;
    doc.head.append(...(cfg.font ? [font] : []), style);
    return true;
  };
  // Every 1.5 s while this page is open: the app reloads when a room's player is chosen.
  clearInterval(window.__dwellMaThemeTimer);
  window.__dwellMaThemeTimer = setInterval(() => { if (!card?.isConnected) clearInterval(window.__dwellMaThemeTimer); else apply(); }, 1500);
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
      bg: '#080e18', surface: '#162536', light: '#111d2b', primary: '#29d5ee', secondary: '#39e2bc', text: '#edf5ff'})}); ]]]`},
    styles: {card: [{height: '0'}, {padding: '0'}, {border: 'none'}, {background: 'none'}, {'box-shadow': 'none'}, {overflow: 'hidden'}],
      grid: [{'grid-template-areas': '"theme"'}]},
    // Takes no room on the page.
    extra_styles: ':host{display:block;height:0;overflow:hidden;margin-bottom:-8px}'
  };
  view.cards = [{type: 'vertical-stack', cards: [helper, app]}, ...view.cards.filter(card => card !== app)];
  return output;
}
