// Shared helpers: cloning, tree walking and entity-ID list rewriting.
export const clone = value => JSON.parse(JSON.stringify(value));
export const entityPattern = /\b[a-z_]+\.[a-z0-9_]+\b/g;
export const listPattern = /(?<![\w$])\[\s*['"][a-z_]+\.[a-z0-9_]+['"](?:\s*,\s*['"][a-z_]+\.[a-z0-9_]+['"])*\s*,?\s*\]/g;
export const walk = (value, fn) => {
  if (Array.isArray(value)) return value.map(v => walk(v, fn));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,walk(v,fn)]));
  return typeof value === 'string' ? fn(value) : value;
};
export const visit = (value, fn) => {
  if (value && typeof value === 'object') { fn(value); Object.values(value).forEach(v => visit(v,fn)); }
};
export function changeLists(value, before, after) {
  if (Array.isArray(value)) {
    if (value.length && value.every(v => typeof v === 'string' && before.has(v))) return [...after];
    return value.map(v => changeLists(v,before,after));
  }
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,changeLists(v,before,after)]));
  if (typeof value === 'string') return value.replace(listPattern, text => {
    const ids = text.match(entityPattern) || [];
    return ids.length && ids.every(id => before.has(id)) ? JSON.stringify(after) : text;
  });
  return value;
}
export const normalizeName = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Card code that many cards run is loaded once, not copied into every card: a template calls it as
// __dwell.<name>(...). Each dashboard load rewrites it the same way as the cards (palette, text sizes).
const SHARED = new Map();
export const sharedCode = fn => {
  if (!SHARED.has(fn.name)) { SHARED.set(fn.name, fn); (globalThis.__dwell ||= {})[fn.name] = fn; }
  return `__dwell.${fn.name}`;
};
export const shareData = (name, value) => { (globalThis.__dwell ||= {})[name] = value; };
export function installShared(transform) {
  for (const [name, fn] of SHARED) {
    const source = fn.toString(), rewritten = transform(source);
    globalThis.__dwell[name] = rewritten === source ? fn : Function(`return (${rewritten});`)();
  }
}

// A template whose HTML has its own buttons, menus or sliders. button-card listens for taps on the whole card
// and cancels the end of every touch, so on a phone a button inside never gets its press; touches inside this
// wrapper stay with the buttons. display:contents keeps the layout as it was.
export const touchSafe = call => `[[[ return '<div class="dw-touch" style="display:contents" ontouchstart="event.stopPropagation()" ontouchend="event.stopPropagation()" ontouchcancel="event.stopPropagation()">' + ${call} + '</div>'; ]]]`;
