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
