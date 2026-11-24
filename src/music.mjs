// Music Assistant page: the Music Assistant app takes DwellDeck's colours and font. The app is served by
// Home Assistant on the same address (add-on ingress), so the dashboard can add a stylesheet to it.
import {DWELL_FONT_URL, DWELL_FONT_STACK} from './design.mjs';

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
