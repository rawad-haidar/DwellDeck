// Climate page: what runs first, heating beside it, then air conditioners, thermostats, scenes and history.
import {test} from 'node:test';
import assert from 'node:assert/strict';
globalThis.HTMLElement = class {};
globalThis.customElements = {get: () => undefined, define: () => {}};
globalThis.window = {};
const {ORIGINAL_TEMPLATE, SLOTS, ROOM_TEMPLATES, generateOriginal} = await import('../dwelldeck.js');
const slot = n => SLOTS.find(s => s.placeholder.endsWith(`dwelldeck_slot_${n}`)).key;
const entities = {[slot(143)]: 'climate.master_ac', [slot(138)]: 'climate.danis_ac', [slot(144)]: 'climate.kitchen_nature', [slot(292)]: 'switch.boiler', [slot(289)]: 'switch.valve_1', [slot(295)]: 'weather.home'};
const view = () => generateOriginal(ORIGINAL_TEMPLATE, SLOTS, ROOM_TEMPLATES, {dashboard_path: '/x', entities}, {}).views.find(v => v.path === 'climate');

test('climate opens with what runs now, heating beside it, then the rest', () => {
  const v = view();
  assert.deepEqual(v.sections.map(s => s.cards[0].heading), ['Climate now', 'Heating', 'AC scenes', 'Air conditioners', 'Thermostats', 'Last 24 hours']);
  assert.equal(v.sections[0].column_span, 2);
  assert(!JSON.stringify(v).includes('"name":"AC live status"'), 'the old list is replaced');
  const heatTile = v.sections[1].cards.find(c => c.entity === 'switch.boiler');
  const top = Number(v.sections[0].cards[1].styles.card.find(r => r.height).height.replace('px', ''));
  assert(heatTile.card_mod.style.includes('height:'), 'heating tiles fill the column');
  assert(top > 200);
});

test('status shows the average temperature, what is on, and turns everything off in two taps', () => {
  const card = view().sections[0].cards[1];
  const st = (state, a = {}) => ({state, attributes: {friendly_name: a.name, ...a}});
  const states = {
    'climate.master_ac': st('cool', {name: 'Master AC', hvac_action: 'cooling', current_temperature: 25, temperature: 22}),
    'climate.danis_ac': st('off', {name: "Dani's AC", current_temperature: 23, temperature: 26}),
    'climate.kitchen_nature': st('off', {current_temperature: 21}),
    'switch.boiler': st('on', {name: 'Diesel boiler'}), 'switch.valve_1': st('off'),
    'weather.home': st('sunny', {temperature: 14})
  };
  globalThis.window = {};
  const html = Function('states', card.custom_fields.status.trim().slice(3, -3))(states);
  assert(html.includes('>23.0°<'), '(25 + 23 + 21) / 3');
  assert(html.includes('Outside 14°'));
  assert(html.includes('1 of 3 on') && html.includes('Heating on'));
  assert(html.includes('Master AC') && html.includes('Cooling') && html.includes('25° <span class="ar">→</span> 22°'));
  assert(html.includes('Diesel boiler'));
  assert(html.includes('"climate":["climate.master_ac"]') && html.includes('"other":["switch.boiler"]'));
  // Arming, then turning off.
  const calls = [];
  globalThis.document = {querySelector: () => ({hass: {callService: async (...args) => calls.push(args)}})};
  const button = {dataset: {label: 'Turn everything off', ids: JSON.stringify({climate: ['climate.master_ac'], other: ['switch.boiler']})}, textContent: ''};
  window.__dwellClimate.off(button);
  assert.equal(calls.length, 0, 'first tap only asks');
  assert.equal(button.textContent, 'Tap again to turn all off');
  window.__dwellClimate.off(button);
  assert.deepEqual(calls, [['climate', 'turn_off', {entity_id: ['climate.master_ac']}], ['homeassistant', 'turn_off', {entity_id: ['switch.boiler']}]]);
  assert(card.styles.custom_fields.status.some(r => r['pointer-events'] === 'auto'));
  // Nothing on.
  const quiet = Function('states', card.custom_fields.status.trim().slice(3, -3))({...states, 'climate.master_ac': st('off', {current_temperature: 25}), 'switch.boiler': st('off')});
  assert(quiet.includes('Nothing is heating or cooling') && !quiet.includes('Turn everything off'));
});
