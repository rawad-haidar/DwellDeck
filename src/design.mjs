// Design refresh: readable type, a clear radius hierarchy, unboxed information cards,
// a sky-first Home page and plain-sentence status copy. Runs on the generated copy,
// so the original template stays untouched.
import {walk, visit} from './util.mjs';
import {liveWeatherCard} from './weather.mjs';

export const DWELL_FONT_STACK = "'Atkinson Hyperlegible Next','Atkinson Hyperlegible',Roboto,system-ui,sans-serif";
export const DWELL_FONT_URL = 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:wght@400;500;600;700&display=swap';
const MIN_TEXT_PX = 12;
const CONTROL_RADIUS = '12px';

// Status copy: plain sentences in sentence case instead of "A · B" fragments and capitals.
const COPY = [
  ['Activity · 24 hours', 'Last 24 hours'],
  ['Lighting · Room control', 'Lighting'],
  ['Air conditioning · Live status', 'Air conditioning'],
  ['Room °C / Set °C · Enabled does not always mean actively cooling', 'Room and target temperature. On does not always mean cooling.'],
  ['${active} of 6 enabled', '${active} of ${ids.filter(id=>states[id]).length} on'],
  ['const rows=ids.map((id,i)=>{const e=states[id];', 'const rows=ids.map((id,i)=>{const e=states[id];if(!e)return \'\';'],
  ['font-size:10px;font-weight:800;letter-spacing:.3px;', 'font-size:13px;font-weight:600;'],
  ["text:'OFF'", "text:'Off'"], ["text:'COOLING'", "text:'Cooling'"], ["text:'HEATING'", "text:'Heating'"],
  ["text:'DRYING'", "text:'Drying'"], ["text:'FAN'", "text:'Fan'"], ["text:'IDLE'", "text:'Idle'"],
  ['text:e.state.toUpperCase()', 'text:e.state.charAt(0).toUpperCase()+e.state.slice(1)'],
  ['`${active.length} ON · ${ids.length} lights', '`${active.length} of ${ids.length} on'],
  ['`All available lights off · ${offline.length} unavailable`', '`All off, ${offline.length} unavailable`'],
  ['`All off · ${ids.length} lights`', '`All ${ids.length} off`'],
  ['# 💡 {{ ns.on }} lights ON / {{ room_lights | count }} total', '## {{ ns.on }} of {{ room_lights | count }} lights on'],
  ['**{{ ns.available - ns.on }} OFF** · **{{ (room_lights | count) - ns.available }} unavailable/unknown**',
    '{{ ns.available - ns.on }} off, {{ (room_lights | count) - ns.available }} unavailable.'],
  ['**{{ n.lights }}** lights on · **{{ n.covers }}** curtains open · **{{ n.media }}** players active',
    "{{ n.lights }} {{ 'light is' if n.lights == 1 else 'lights are' }} on, {{ n.covers }} {{ 'curtain is' if n.covers == 1 else 'curtains are' }} open and {{ n.media }} {{ 'player is' if n.media == 1 else 'players are' }} playing."]
];

const raiseSmallText = text => text.replace(/(font-size\s*:\s*)(\d+(?:\.\d+)?)px/g,
  (match, key, size) => Number(size) < MIN_TEXT_PX ? `${key}${MIN_TEXT_PX}px` : match);
// Controls get 12px corners; popups keep their larger 20px corners.
const tightenRadius = text => text.replace(/(border-radius\s*:\s*)16px/g, `$1${CONTROL_RADIUS}`);
export const refreshText = text => tightenRadius(raiseSmallText(COPY.reduce((value, [from, to]) => value.split(from).join(to), text)));

const appendStyle = (card, css) => {
  if (!card.card_mod) card.card_mod = {style: css};
  else if (typeof card.card_mod.style === 'string') card.card_mod.style += '\n' + css;
  else if (card.card_mod.style && typeof card.card_mod.style === 'object') card.card_mod.style['.'] = (card.card_mod.style['.'] || '') + '\n' + css;
  else card.card_mod.style = css;
};
const isCard = card => typeof card.type === 'string' && !card.type.startsWith('custom:popup') &&
  (card.type.startsWith('custom:') || ['markdown', 'tile', 'button', 'entities', 'history-graph', 'thermostat', 'picture-entity',
    'alarm-panel', 'weather-forecast', 'media-control', 'logbook', 'heading'].includes(card.type));

export function applyDesignRefresh(dashboard, config = {}) {
  const output = walk(dashboard, refreshText);
  const font = config.font === 'system' ? '' :
    `:host{--ha-font-family-body:${DWELL_FONT_STACK};--mdc-typography-font-family:${DWELL_FONT_STACK};--paper-font-common-base_-_font-family:${DWELL_FONT_STACK};} ha-card{font-family:${DWELL_FONT_STACK};}`;
  visit(output, item => {
    // button-card style lists hold values without their CSS property names.
    for (const [key, value] of Object.entries(item)) {
      if (typeof value !== 'string') continue;
      if (key === 'font-size') item[key] = raiseSmallText(`font-size:${value}`).slice(10);
      if (key === 'border-radius' && value === '16px') item[key] = CONTROL_RADIUS;
    }
    if (!isCard(item)) return;
    // Information sits on the page; only things you tap keep a raised surface.
    if (item.type === 'markdown') appendStyle(item, 'ha-card{background:transparent!important;border:none!important;box-shadow:none!important;}');
    if (font) appendStyle(item, font);
  });
  return output;
}

// Home opens with the live sky, then one sentence about the house. Runs before unselected
// entities become setup hints, so the sky keeps its place even before a weather entity is chosen.
export function skyFirst(dashboard) {
  const first = dashboard.views.find(view => view.path === 'home')?.sections?.[0];
  if (!first?.cards) return;
  const sky = first.cards.find(card => card.custom_fields?.sky);
  const rest = first.cards.filter(card => card !== sky && !(card.type === 'heading' && card.heading === 'Welcome home'));
  if (sky) first.cards = [liveWeatherCard(sky), ...rest];
  // The weather hero gets room to breathe: the first Home section spans two columns.
  first.column_span = 2;
}

// Fonts declared in the page are available inside every card's shadow root.
export function loadDwellFont(config = {}) {
  if (config.font === 'system' || typeof document === 'undefined' || document.getElementById('dwelldeck-font')) return;
  const link = document.createElement('link');
  Object.assign(link, {id: 'dwelldeck-font', rel: 'stylesheet', href: DWELL_FONT_URL});
  document.head.append(link);
}
