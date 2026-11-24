// Unselected entities become setup hints, but only for whole cards: rows inside
// entity lists must stay valid rows, or history graphs and entities cards break.
import {test} from 'node:test';
import assert from 'node:assert/strict';
globalThis.HTMLElement = class {};
globalThis.customElements = {get: () => undefined, define: () => {}};
globalThis.window = {};
const {ORIGINAL_TEMPLATE, SLOTS, ROOM_TEMPLATES, generateOriginal} = await import('../dwelldeck.js');

const entityLists = dashboard => {
  const lists = [];
  const walk = (value, path) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value.entities) && value.type) lists.push({path, card: value});
    for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`);
  };
  walk(dashboard, '');
  return lists;
};
const historyCard = (dashboard, view, index) => entityLists(dashboard)
  .filter(({path, card}) => card.type === 'history-graph' && path.startsWith(`.views.${dashboard.views.findIndex(v => v.path === view)}.`))[index]?.card;

// Bind every other sensor in the first Activity history graph, as a partly configured home would.
const templateHistory = historyCard(ORIGINAL_TEMPLATE, 'notifications', 0);
const bound = {};
templateHistory.entities.forEach((row, i) => {
  const slot = SLOTS.find(s => s.placeholder === row.entity);
  if (i % 2 === 0) bound[slot.key] = `binary_sensor.real_${i}`;
});
const config = {dashboard_path: '/dashboard-test', entities: bound};

for (const [name, cfg] of [['unconfigured', {dashboard_path: '/dashboard-test'}], ['partly configured', config]]) {
  test(`${name}: entity-list rows are never replaced with setup hint cards`, () => {
    const d = generateOriginal(ORIGINAL_TEMPLATE, SLOTS, ROOM_TEMPLATES, cfg);
    const broken = entityLists(d).flatMap(({path, card}) => card.entities
      .filter(row => typeof row !== 'string' && (row?.type === 'markdown' || (card.type === 'history-graph' && !row?.entity)))
      .map(() => `${path} (${card.type})`));
    assert.deepEqual([...new Set(broken)], []);
  });
}

test('history graphs keep selected sensors and drop unselected ones', () => {
  const d = generateOriginal(ORIGINAL_TEMPLATE, SLOTS, ROOM_TEMPLATES, config);
  const card = historyCard(d, 'notifications', 0);
  assert.equal(card.type, 'history-graph');
  assert.deepEqual(card.entities.map(row => row.entity), Object.values(bound));
  assert.equal(card.entities[0].name, templateHistory.entities[0].name);
});

test('a card with no selected entities at all becomes a single setup hint', () => {
  const d = generateOriginal(ORIGINAL_TEMPLATE, SLOTS, ROOM_TEMPLATES, {dashboard_path: '/dashboard-test'});
  const view = d.views.find(v => v.path === 'notifications');
  const card = view.sections[1].cards[1];
  assert.equal(card.type, 'markdown');
  assert.equal(card.content, 'Select an entity in DwellDeck setup.');
});
