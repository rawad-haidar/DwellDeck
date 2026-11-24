// Security view: camera human/vehicle detection status and recent activity.
import {test} from 'node:test';
import assert from 'node:assert/strict';
globalThis.HTMLElement = class {};
globalThis.customElements = {get: () => undefined, define: () => {}};
globalThis.window = {};
const {ORIGINAL_TEMPLATE, SLOTS, ROOM_TEMPLATES, generateOriginal} = await import('../dwelldeck.js');
const generate = config => generateOriginal(ORIGINAL_TEMPLATE, SLOTS, ROOM_TEMPLATES, {dashboard_path: '/dashboard-test', ...config});
const detectionSection = dashboard => dashboard.views.find(v => v.path === 'security').sections
  .find(s => s.cards.some(c => c.type === 'heading' && c.heading === 'Camera detection'));

test('security view gets a camera detection section with status and recent activity', () => {
  const section = detectionSection(generate({}));
  assert(section, 'Camera detection section is missing');
  const markdown = section.cards.filter(c => c.type === 'markdown').map(c => c.content);
  assert.equal(markdown.length, 2);
  for (const content of markdown) {
    assert.match(content, /states\.binary_sensor/);
    assert.match(content, /'person' in label or 'human' in label/);
    assert.match(content, /'vehicle' in label or 'car detection' in label/);
  }
  assert.match(markdown[0], /Detected now/);
  assert.match(markdown[1], /\| Camera \| 🧍 Human \| 🚗 Vehicle \|/);
});

test('the history shortcut opens the Activity view under the dashboard path', () => {
  // Detection history and Recent history opened the same page; one History button remains.
  const bar = generate({}).views.find(v => v.path === 'security').sections.find(s => s.cards[0].heading === 'Shortcuts').cards[1].custom_fields.bar;
  const html = Function('states', bar.trim().slice(3, -3))({});
  assert(html.includes('data-path="/dashboard-test/notifications"'));
  assert.equal(html.match(/notifications"/g).length, 1);
});

test('detection cards use the dashboard colours and selected palette', () => {
  const ocean = JSON.stringify(detectionSection(generate({color_palette: 'ocean'})));
  const lamplight = JSON.stringify(detectionSection(generate({})));
  const emerald = JSON.stringify(detectionSection(generate({color_palette: 'emerald'})));
  assert(ocean.includes('--primary-text-color:#edf5ff'));
  assert(lamplight.includes('--primary-text-color:#e8e2d8'));
  assert(emerald.includes('#183d38'));
});

test('the section is also added to area-based layouts', () => {
  assert(detectionSection(generate({area_rooms: true, rooms: {a: {name: 'A', area: 'a'}}})));
});

test('camera_detection: false leaves the security view unchanged', () => {
  const security = d => JSON.stringify(d.views.find(v => v.path === 'security'));
  assert.equal(detectionSection(generate({camera_detection: false})), undefined);
  assert(security(generate({camera_detection: false})).length < security(generate({})).length);
});
