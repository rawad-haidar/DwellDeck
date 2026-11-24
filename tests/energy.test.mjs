// Energy page: inverters found by name, a live power flow, today's totals and 30-day graphs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
globalThis.HTMLElement = class {};
globalThis.customElements = {get: () => undefined, define: () => {}};
globalThis.window = {};
const {ORIGINAL_TEMPLATE, SLOTS, ROOM_TEMPLATES, generateOriginal} = await import('../dwelldeck.js');
const {discoverInverters, energySetup} = await import('../src/energy.mjs');

// Two Deye inverters in parallel through Solarman, as on a real system at night: battery discharging.
const s = (id, state, unit, name) => [`sensor.electric_room_inverter_${id}`, {state: String(state), attributes: {unit_of_measurement: unit, friendly_name: name}}];
const both = (key, unit, master, slave, label) => [s(`master_${key}`, master, unit, `Inverter Master ${label}`), s(`slave_${key}`, slave, unit, `Inverter Slave ${label}`)];
const states = Object.fromEntries([
  ...both('pv_power', 'W', 0, 20, 'PV Power'), ...both('battery_power', 'W', 1039, 945, 'Battery Power'), ...both('grid_power', 'W', 0, 0, 'Grid Power'),
  ...both('power', 'W', 938, 919, 'Power'), ...both('load_power', 'W', 938, 9190, 'Load Power'), ...both('battery', '%', 70, 70, 'Battery'),
  ...both('pv1_power', 'W', 0, 20, 'PV1 Power'),
  ...both('today_production', 'kWh', 24.6, 23.6, 'Today Production'), ...both('today_load_consumption', 'kWh', 20.6, 20.3, 'Today Load Consumption'),
  ...both('today_battery_charge', 'kWh', 17.1, 13.4, 'Today Battery Charge'), ...both('today_battery_discharge', 'kWh', 12.6, 11.1, 'Today Battery Discharge'),
  ...both('today_energy_import', 'kWh', 0, 0, 'Today Energy Import'), ...both('today_energy_export', 'kWh', 0, 0, 'Today Energy Export'),
  ...both('total_production', 'kWh', 18019, 21634, 'Total Production'), ...both('total_load_consumption', 'kWh', 19382, 21734, 'Total Load Consumption'),
  ...both('total_battery_charge', 'kWh', 12114, 12213, 'Total Battery Charge'), ...both('total_battery_discharge', 'kWh', 11014, 11938, 'Total Battery Discharge'),
  ...both('total_energy_import', 'kWh', 2245, 0.2, 'Total Energy Import'), ...both('total_energy_export', 'kWh', 86, 84, 'Total Energy Export'),
  ['sensor.electric_room_deye_pv_power', {state: '20', attributes: {unit_of_measurement: 'W'}}]
]);
const hass = {states, entities: {}, areas: {}, devices: {}};

test('finds both inverters by name and skips a group that only adds up PV', () => {
  const inverters = discoverInverters(hass);
  assert.deepEqual(inverters.map(inv => inv.pv), ['sensor.electric_room_inverter_master_pv_power', 'sensor.electric_room_inverter_slave_pv_power']);
  // The output power, not the load power (one inverter reports load ten times too high).
  assert.equal(inverters[1].load, 'sensor.electric_room_inverter_slave_power');
  assert.equal(inverters[0].today.solar, 'sensor.electric_room_inverter_master_today_production');
});

const energy = d => d.views.find(v => v.path === 'energy');
const run = (card, field) => Function('states', card.custom_fields[field].trim().slice(3, -3))(states);

test('the power flow adds the inverters up and shows the direction of each flow', () => {
  const view = energy(generateOriginal(ORIGINAL_TEMPLATE, SLOTS, ROOM_TEMPLATES, {dashboard_path: '/x'}, hass));
  assert.deepEqual(view.sections.map(s => s.cards[0].heading), ['Power flow', 'Today', 'History']);
  globalThis.window = {};
  const html = run(view.sections[0].cards[1], 'flow');
  assert(html.includes('>1.9 kW<'), 'home: 938 + 919 W');
  assert(html.includes('>2.0 kW<') && html.includes('Discharging'), 'battery: 1039 + 945 W, discharging');
  assert(html.includes('Battery · 70%'));
  assert(html.includes('Idle'), 'grid idle');
  assert.equal((html.match(/<animateMotion/g) || []).length, 9, 'dots on solar, home and battery lines, none on the idle grid line');
  assert(view.sections[0].cards[1].styles.custom_fields.flow.some(r => r['pointer-events'] === 'auto'));
});

test('today adds up both inverters', () => {
  const view = energy(generateOriginal(ORIGINAL_TEMPLATE, SLOTS, ROOM_TEMPLATES, {dashboard_path: '/x'}, hass));
  const html = run(view.sections[1].cards[1], 'today');
  assert(html.includes('48.2<small> kWh</small>') && html.includes('Solar produced'));
  assert(html.includes('40.9<small> kWh</small>') && html.includes('Home used'));
});

test('history has a date dropdown and reads statistics for the picked range', async () => {
  const view = energy(generateOriginal(ORIGINAL_TEMPLATE, SLOTS, ROOM_TEMPLATES, {dashboard_path: '/x'}, hass));
  const card = view.sections[2].cards[1];
  const body = card.custom_fields.history.trim().slice(3, -3);
  const calls = [];
  const day = 86400000, start = new Date(); start.setHours(0, 0, 0, 0);
  const rows = n => [...Array(n).keys()].map(i => ({start: start.getTime() - (n - 1 - i) * day, change: 10 + i, mean: 500 + i, min: 40, max: 90}));
  const fakeHass = {callWS: async msg => { calls.push(msg); return Object.fromEntries(msg.statistic_ids.map(id => [id, rows(msg.period === 'day' ? 7 : 3)])); }};
  globalThis.window = {}; globalThis.localStorage = undefined;
  const shadow = {querySelector: () => null};
  const html = Function('states', 'hass', body).call({shadowRoot: shadow}, {}, fakeHass);
  for (const label of ['Today', 'Yesterday', 'Last 2 days', 'Last 3 days', 'Last week', 'Last 2 weeks', 'Last 3 weeks', 'Last month', 'Custom dates']) assert(html.includes(`>${label}</option>`), label);
  assert(html.includes('type="date"'));
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(calls[0].type, 'recorder/statistics_during_period');
  assert.equal(calls[0].period, 'day', 'a month is shown per day');
  assert(calls[0].statistic_ids.includes('sensor.electric_room_inverter_master_total_production'));
  assert.equal(Math.round((new Date(calls[0].end_time) - new Date(calls[0].start_time)) / day), 30);
  // Drawn after loading: both inverters added up per day.
  const drawn = Function('states', 'hass', body).call({shadowRoot: shadow}, {}, fakeHass);
  assert(drawn.includes('Solar and home, kWh per day'));
  assert(drawn.includes('<rect'));
  // Picking "Yesterday" reads hours.
  window.__dwellHist.energy.range = 'yesterday'; window.__dwellHist.energy.asked = '';
  await window.__dwellHistLoad.energy();
  assert.equal(calls.at(-1).period, 'hour');
  assert(card.styles.custom_fields.history.some(r => r['pointer-events'] === 'auto'));
});

test('sign conventions can be flipped in setup', () => {
  const setup = energySetup({energy: {battery_charging: 'positive', grid_import: 'negative'}}, hass);
  assert.equal(setup.batteryCharging, 1);
  assert.equal(setup.gridImport, -1);
});

test('the dashboard editor shows the energy sensors that were found, and chosen ones override them', async () => {
  const {energyEditorValues} = await import('../src/energy.mjs');
  const found = energyEditorValues({}, hass);
  assert.deepEqual(found.home, ['sensor.electric_room_inverter_master_power', 'sensor.electric_room_inverter_slave_power']);
  assert.equal(found.battery_charging, 'negative');
  assert.equal(found.today_solar.length, 2);
  const chosen = {energy: {...found, home: ['sensor.villa_power'], grid_import: 'negative'}};
  const setup = energySetup(chosen, hass);
  assert.deepEqual(setup.home, ['sensor.villa_power']);
  assert.equal(setup.gridImport, -1);
  const view = generateOriginal(ORIGINAL_TEMPLATE, SLOTS, ROOM_TEMPLATES, {dashboard_path: '/x', ...chosen}, hass).views.find(v => v.path === 'energy');
  assert(view.sections[0].cards[1].custom_fields.flow.includes('sensor.villa_power'));
});

test('each field adds up, averages or draws one line per sensor, as chosen', async () => {
  const {shortNames} = await import('../src/energy.mjs');
  assert.deepEqual(Object.values(shortNames(['sensor.electric_room_inverter_master_power', 'sensor.electric_room_inverter_slave_power'], hass)), ['Master', 'Slave']);
  const historyOf = config => {
    const view = energy(generateOriginal(ORIGINAL_TEMPLATE, SLOTS, ROOM_TEMPLATES, {dashboard_path: '/x', ...config}, hass));
    return view.sections[2].cards[1].custom_fields.history.trim().slice(3, -3);
  };
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const fakeHass = {callWS: async msg => Object.fromEntries(msg.statistic_ids.map(id => [id, [0, 1].map(i => ({start: start.getTime() - (1 - i) * 86400000,
    change: id.includes('master') ? 10 : 20, mean: id.includes('master') ? 60 : 80, min: 50, max: 90}))]))};
  const draw = async body => {
    globalThis.window = {};
    const shadow = {querySelector: () => null};
    Function('states', 'hass', body).call({shadowRoot: shadow}, {}, fakeHass);
    await new Promise(resolve => setTimeout(resolve, 20));
    return Function('states', 'hass', body).call({shadowRoot: shadow}, {}, fakeHass);
  };
  // Default: energy added up (10 + 20 per day), battery level averaged (60 and 80 → 70).
  const plain = await draw(historyOf({}));
  assert(plain.includes('Solar <b>60.0 kWh</b>'), 'two days of 10 + 20');
  assert(!plain.includes('Solar · Master'));
  // One line each for energy; battery level shown per inverter too.
  const found = energySetup({}, hass);
  const each = await draw(historyOf({energy: {solar: found.solar, home: found.home, energy_combine: 'each', battery_soc_combine: 'each'}}));
  assert(each.includes('Solar · Master <b>20.0 kWh</b>') && each.includes('Solar · Slave <b>40.0 kWh</b>'));
  assert(each.includes('Battery · Master') && each.includes('stroke-dasharray'));
  // Averaged power in the flow.
  const avg = energy(generateOriginal(ORIGINAL_TEMPLATE, SLOTS, ROOM_TEMPLATES, {dashboard_path: '/x', energy: {home_combine: 'average'}}, hass));
  globalThis.window = {};
  assert(run(avg.sections[0].cards[1], 'flow').includes('>929 W<'), '(938 + 919) / 2');
});
