// Built-in colours, selectable palettes and the animated "living" design layer.
import {walk, visit} from './util.mjs';
import {BUILTIN_THEME} from './data.mjs';

export function addBuiltinColors(dashboard) {
  const variables=Object.entries(BUILTIN_THEME).filter(([key,value])=>key!=='modes'&&typeof value==='string').map(([key,value])=>`--${key}:${value};`).join('');
  const css=`:host {${variables}} ha-card {color:var(--primary-text-color);background:var(--ha-card-background);border-radius:var(--ha-card-border-radius);}`;
  for(const view of dashboard.views){delete view.theme;view.card_mod={...view.card_mod,style:`:host{${variables}}`};}
  visit(dashboard,item=>{
    const nativeCards=['markdown','tile','button','entities','history-graph','thermostat','picture-entity','alarm-panel','weather-forecast','media-control'];
    if(!nativeCards.includes(item.type)&&!item.type?.startsWith('custom:'))return;
    if(!item.card_mod)item.card_mod={style:css};
    else if(typeof item.card_mod.style==='string')item.card_mod.style=css+'\n'+item.card_mod.style;
    else if(item.card_mod.style&&typeof item.card_mod.style==='object')item.card_mod.style={...item.card_mod.style,'.':css+'\n'+(item.card_mod.style['.']||'')};
    else item.card_mod.style=css;
  });
}
// Every colour in the original design belongs to one role. A palette recolours a role
// everywhere it appears (card-mod CSS, button-card templates, inline HTML and SVG),
// so a palette change reaches every accent, not only the card backgrounds.
export const COLOR_ROLES = {
  page: ['#080e18', '#080f1b', '#0b141f', '#07131f'],
  popup: ['#101c2b'], card: ['#162536'], tileA: ['#1b2d40'], tileB: ['#172638'],
  text: ['#edf5ff', '#f2f7ff', '#dbe9ff'], textSoft: ['#b1becd', '#b7cadd', '#c0cede'],
  muted: ['#91a8bd', '#91b4ce'], faint: ['#7892a9', '#758da3'], unavailable: ['#586a80', '#62798e'],
  accent: ['#29d5ee', '#2ed7f0', '#4b9aee', '#49a8ff'], accentSoft: ['#8fc8dd', '#a6dbff', '#a9dcff'],
  active: ['#39e2bc', '#4ed7bd', '#31dcc4'],
  lampBg: ['#493b24'], lampBgEnd: ['#202936'], lamp: ['#d5a74c'], lampText: ['#efc875', '#ffd16b', '#ffdc91'],
  violet: ['#be92f4', '#c28af4', '#9e9cf2', '#d4c7ff'], heat: ['#f5af7d', '#f3ac76', '#ff9a66'],
  alert: ['#ff7885', '#ef9aab', '#a96e71'],
  line: ['rgba(156,199,225,.12)', 'rgba(156,199,225,.15)', 'rgba(156,199,225,.18)', 'rgba(156,199,225,.1)'],
  cardGlassA: ['rgba(29,47,65,.94)'], cardGlassB: ['rgba(15,27,42,.97)'], scrim: ['rgba(3,8,16,.76)'],
  washA: ['rgba(12,79,94,.28)'], washB: ['rgba(75,35,100,.18)'],
  skyPanel: ['rgba(5,15,29,.83)', 'rgba(5,15,29,.89)', 'rgba(4,14,27,.85)']
};
// colors: [tile, popup, tile end, accent] drive the editor swatch; roles override COLOR_ROLES.
export const DWELL_PALETTES = {
  lamplight: {name: 'Lamplight', colors: ['#212a35', '#181f28', '#1b232d', '#f2b950'], page: '#141a22', roles: {
    page: '#141a22', popup: '#181f28', card: '#1b222c', tileA: '#212a35', tileB: '#1b232d',
    text: '#e8e2d8', textSoft: '#cfc8bc', muted: '#a8a296', faint: '#948e83', unavailable: '#8a8478',
    accent: '#8fb8d0', accentSoft: '#a9c6d6', active: '#a8c49a',
    lampBg: '#3b2e18', lampBgEnd: '#262119', lamp: '#f2b950', lampText: '#f6c868',
    violet: '#b9a6d3', heat: '#e8a070', alert: '#ec7a6c',
    line: 'rgba(232,226,216,.10)', cardGlassA: 'rgba(33,42,53,.94)', cardGlassB: 'rgba(27,35,45,.97)',
    scrim: 'rgba(10,12,16,.78)', washA: 'rgba(0,0,0,0)', washB: 'rgba(0,0,0,0)', skyPanel: 'rgba(20,26,34,.86)'
  }},
  ocean: {name: 'Ocean blue', colors: ['#1b2d40', '#101c2b', '#172638', '#29d5ee'], page: '#080e18', roles: {card: '#162536', accent: undefined, accentSoft: undefined}},
  emerald: {name: 'Emerald', colors: ['#183d38', '#102823', '#15342e', '#4cc9a6'], page: '#081712'},
  violet: {name: 'Amethyst', colors: ['#332547', '#1d152e', '#2b203c', '#b294ef'], page: '#100b1b'},
  rose: {name: 'Rosewood', colors: ['#432b38', '#291a25', '#36222f', '#e49db9'], page: '#190e16'},
  slate: {name: 'Graphite', colors: ['#303944', '#1c222b', '#28313c', '#a4bfd8'], page: '#10141b'}
};
export const DEFAULT_PALETTE = 'lamplight';
const paletteRoles = palette => {
  const [tileA, popup, tileB, accent] = palette.colors;
  return {page: palette.page, popup, tileA, tileB, card: tileA, accent, accentSoft: accent, unavailable: '#8094a9', ...palette.roles};
};
// One spelling per colour: "rgba(156, 199, 225, 0.12)" and "rgba(156,199,225,.12)" become the same string.
export const normalizeRgba = text => text.replace(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*0?(\.\d+)\s*\)/g, 'rgba($1,$2,$3,$4)');
export function applyDwellPalette(dashboard, key) {
  const name = DWELL_PALETTES[key] ? key : DEFAULT_PALETTE;
  const palette = DWELL_PALETTES[name];
  const roles = paletteRoles(palette);
  const replacements = new Map();
  for (const [role, sources] of Object.entries(COLOR_ROLES)) if (roles[role]) for (const color of sources) replacements.set(color, roles[role]);
  const pattern = new RegExp([...replacements.keys()].map(c => c.replace(/[().|]/g, '\\$&')).join('|'), 'gi');
  const themed = walk(dashboard, text => normalizeRgba(text).replace(pattern, color => replacements.get(color.toLowerCase()) || color));
  const accent = roles.accent || palette.colors[3];
  const surface = name === 'lamplight' ? roles.page : `linear-gradient(135deg,${roles.page},${roles.popup})`;
  for (const view of themed.views) {
    view.card_mod ||= {};
    view.card_mod.style = (view.card_mod.style || '') + `
:host {--primary-color:${accent};--accent-color:${accent};--lovelace-background:${surface};--primary-background-color:${roles.page};--ha-card-background:${roles.card};--card-background-color:${roles.card};--history-unavailable-color:${roles.unavailable};background:${surface}!important;}`;
  }
  return themed;
}

// Motion follows actual entity activity; reduced-motion preferences remain respected.
export function addLivingDesign(dashboard) {
  const motion = `
    @keyframes dwell-breathe { 0%,100% {filter: brightness(1);} 50% {filter: brightness(1.14);} }
    ha-card {transition:background .7s ease,border-color .7s ease,box-shadow .7s ease;}
    @media (prefers-reduced-motion:reduce) {ha-card,ha-state-icon {animation:none!important;transition:none!important;transform:none!important;}}
  `;
  visit(dashboard, card => {
    if (card.type === 'custom:button-card') {
      const ids = (Array.isArray(card.triggers_update) ? card.triggers_update : [card.entity]).filter(id => typeof id === 'string' && /^(light|switch|cover|climate|media_player|fan)\./.test(id));
      if (!ids.length) return;
      const active = `const ids=${JSON.stringify(ids)}; return ids.some(id=>{const e=states[id];if(!e)return false;if(id.startsWith('climate.'))return ['heating','cooling','drying','fan'].includes(e.attributes?.hvac_action);return ['on','playing','opening','closing'].includes(e.state);});`;
      card.styles ||= {};
      card.styles.card ||= [];
      card.styles.card.push({transition:'background .7s ease, border-color .7s ease, box-shadow .7s ease'},
        {'box-shadow':`[[[ return (()=>{${active}})() ? '0 0 22px rgba(255,196,90,.16), inset 0 1px 0 rgba(255,223,163,.12)' : '0 5px 18px rgba(0,0,0,.12)'; ]]]`});
      card.styles.icon ||= [];
      card.styles.icon.push({animation:`[[[ return (()=>{${active}})() ? 'dwell-breathe 3.6s ease-in-out infinite' : 'none'; ]]]`});
      card.extra_styles = (card.extra_styles || '') + motion;
    } else if (['tile','thermostat','media-control','picture-entity','markdown','history-graph','logbook'].includes(card.type)) {
      let style = motion;
      if (card.entity && /^(light|switch|cover|climate|media_player|fan)\./.test(card.entity)) {
        const id=JSON.stringify(card.entity);
        style += `{% set e = states[${id}] %}
          {% set active = e is not none and (e.state in ['on','playing','opening','closing'] or e.attributes.get('hvac_action') in ['heating','cooling','drying','fan']) %}
          ha-card {box-shadow:{% if active %}0 0 24px rgba(255,196,90,.18), inset 0 1px 0 rgba(255,223,163,.12){% else %}0 5px 18px rgba(0,0,0,.12){% endif %};}
          ha-state-icon {animation:{% if active %}dwell-breathe 3.6s ease-in-out infinite{% else %}none{% endif %};}`;
      }
      if (!card.card_mod) card.card_mod={style};
      else if(typeof card.card_mod.style==='string') card.card_mod.style += '\n'+style;
      else if(card.card_mod.style && typeof card.card_mod.style==='object') card.card_mod.style['.']=(card.card_mod.style['.']||'')+'\n'+style;
    }
  });
  const home=dashboard.views.find(view=>view.path==='home');
  let greeted=false;
  visit(home, card=>{
    if(!greeted && card.type==='markdown' && card.content?.includes('now().strftime')) {
      card.content = `{% set hour = now().hour %}\n### {% if hour < 12 %}Good morning{% elif hour < 18 %}Good afternoon{% else %}Good evening{% endif %}\n` + card.content;
      greeted=true;
    }
  });
}
