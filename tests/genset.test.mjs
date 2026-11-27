import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gensetSetup, gensetSection, dwellGenset, DSE_MODES} from '../src/genset.mjs';

const st = (state, unit) => ({state: String(state), attributes: unit ? {unit_of_measurement: unit} : {}});
const states = {
  'sensor.gen_control_mode': st(1), 'sensor.gen_engine_speed': st(0, 'rpm'), 'sensor.gen_frequency': st(0, 'Hz'),
  'sensor.gen_l1_n_voltage': st(0, 'V'), 'sensor.gen_coolant_temp': st(37, '°C'), 'sensor.gen_oil_pressure': st(-1, 'kPa'),
  'sensor.gen_fuel_level': st(-1, '%'), 'sensor.gen_battery_voltage': st(13.8, 'V'), 'sensor.electric_generator_power': st(0, 'W'),
  'sensor.inverter_master_grid_l1_voltage': st(5.9, 'V'),
  'sensor.gen_mains_voltage': st(231, 'V'),
  ...Object.fromEntries(['stop_mode', 'auto_mode', 'manual_mode', 'start', 'reset_alarms', 'mute_alarm', 'on_load', 'off_load'].map(n => [`script.gen_${n}`, st('off')]))
};

test('a DSE generator on Modbus is found by its gen_ names', () => {
  const setup = gensetSetup({}, {states});
  assert.equal(setup.mode, 'sensor.gen_control_mode');
  assert.equal(setup.rpm, 'sensor.gen_engine_speed');
  assert.equal(setup.voltage, 'sensor.gen_l1_n_voltage');
  assert.equal(setup.battery, 'sensor.gen_battery_voltage');
  assert.equal(setup.power, 'sensor.electric_generator_power');
  assert.equal(setup.mains, 'sensor.gen_mains_voltage', 'the controller\'s own mains reading, never the inverter\'s grid input');
  const {['sensor.gen_mains_voltage']: _, ...noMains} = states;
  assert.equal(gensetSetup({}, {states: noMains}).mains, null);
  assert.deepEqual(setup.scripts, {auto: 'script.gen_auto_mode', manual: 'script.gen_manual_mode', stop: 'script.gen_stop_mode', start: 'script.gen_start',
    mute: 'script.gen_mute_alarm', reset: 'script.gen_reset_alarms', on_load: 'script.gen_on_load', off_load: 'script.gen_off_load'});
  assert.equal(gensetSetup({}, {states: {'sensor.kitchen_temp': st(20)}}), null, 'no generator, no card');
  assert.equal(gensetSetup({generator: {name: 'DSE 6110', mode: 'sensor.other_mode'}}, {states}).mode, 'sensor.other_mode', 'settings win');
});

test('the live panel shows the state and every fitted reading as tiles', () => {
  const cfg = {...gensetSetup({}, {states}), modes: DSE_MODES, c: {text: '#fff', muted: '#999', line: '#333', on: '#440', onText: '#fc0'}};
  const html = dwellGenset(states, cfg);
  for (const text of ['Engine at rest', 'Mode · Auto', 'Mains OK · 231 V', '>Load<', '0 W', '0 rpm', '13.8 V', '37 °C', 'Frequency']) assert(html.includes(text), text);
  assert(!html.includes('Oil pressure') && !html.includes('>Fuel<'), 'sensors reporting -1 (not fitted) get no tile');
  const running = {...states, 'sensor.gen_engine_speed': st(1500), 'sensor.gen_frequency': st(50.1), 'sensor.gen_l1_n_voltage': st(229), 'sensor.electric_generator_power': st(4200), 'sensor.gen_control_mode': st(2)};
  const html2 = dwellGenset(running, cfg);
  for (const text of ['Running on load', '1500 rpm', '229 V', '50.1 Hz', '4.2 kW', 'Mode · Manual']) assert(html2.includes(text), text);
});

test('history: runs, running time and energy come from the recorder', async () => {
  const {dwellGensetHistory} = await import('../src/genset.mjs');
  const h = 3600000, from = Date.UTC(2026, 10, 27, 0), to = from + 12 * h;
  globalThis.window = {__dwellGenHist: {g: {range: 'today', loading: false, asked: 'done', data: {from, to, error: '', rows: {
    'sensor.gen_engine_speed': [{t: from, v: 0}, {t: from + 2 * h, v: 1500}, {t: from + 4 * h, v: 0}, {t: from + 10 * h, v: 1500}],
    'sensor.electric_generator_power': [{t: from, v: 0}, {t: from + 2 * h, v: 3000}, {t: from + 3 * h, v: 5000}, {t: from + 4 * h, v: 0}, {t: from + 10 * h, v: 2000}],
    'sensor.gen_coolant_temp': [{t: from + 2 * h, v: 40}, {t: from + 3 * h, v: 82}, {t: from + 4 * h, v: 70}]
  }}}}};
  const html = dwellGensetHistory(null, {}, {rpm: 'sensor.gen_engine_speed', power: 'sensor.electric_generator_power', coolant: 'sensor.gen_coolant_temp', c: {text: '#fff', muted: '#999', line: '#333', on: '#440', onText: '#fc0'}});
  assert.match(html, /Running time<\/div><div class="sv">4 h 00 min/, 'two runs: 2 h + 2 h (the second still running)');
  assert.match(html, /Energy<\/div><div class="sv">12\.0 kWh/, '3 kWh + 5 kWh in the first run, 2 kW × 2 h in the second');
  assert.match(html, /Starts<\/div><div class="sv">2/);
  assert.match(html, /running<\/span>/, 'the open run is marked running');
  assert.match(html, /max 82 °C/);
  assert.match(html, /peak 5\.0 kW/);
  delete globalThis.window;
});

test('the buttons call the scripts, ask before acting, and mark the current mode', () => {
  const section = gensetSection(gensetSetup({}, {states}));
  const buttons = section.cards.find(c => c.type === 'grid').cards;
  assert.deepEqual(buttons.map(b => b.name), ['Auto', 'Manual', 'Mute alarm', 'To mains', 'Start', 'Stop', 'On load', 'Reset alarms']);
  const start = buttons.find(b => b.name === 'Start');
  assert.deepEqual(start.tap_action.target, {entity_id: 'script.gen_start'});
  assert.match(start.tap_action.confirmation.text, /Start the generator/);
  assert.equal(buttons.find(b => b.name === 'Mute alarm').tap_action.confirmation, undefined, 'muting the horn needs no question');
  assert.match(buttons.find(b => b.name === 'Auto').styles.custom_fields.dot.find(s => s.display).display, /=== 1/);
  assert.equal(buttons.find(b => b.name === 'Start').styles.custom_fields.dot.find(s => s.display).display, 'none');
});
