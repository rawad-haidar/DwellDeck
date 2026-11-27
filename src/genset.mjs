// Generator card for the Energy page, laid out like DSE's own controller page: the states on the
// left, the front-panel buttons below. Built when generator sensors are found (named gen_…, as a
// DSE controller on Modbus usually is) or set under `generator:` in the strategy config.
//
//   generator:
//     name: DSE 6110 MKIII
//     mode: sensor.gen_control_mode        # DSE control mode register (0 Stop, 1 Auto, 2 Manual, …)
//     rpm / frequency / voltage / power / coolant / oil / fuel / battery / mains: sensor ids
//     scripts: {auto, manual, stop, start, mute, reset, on_load, off_load}: script ids
import {ROOM_COLORS} from './rooms.mjs';
import {touchSafe} from './util.mjs';

const GEN_C = ROOM_COLORS;
const GEN_PREFIX = '(?:gen|generator|genset|dse)';
// DSE GenComm control mode values.
export const DSE_MODES = {0: 'Stop', 1: 'Auto', 2: 'Manual', 3: 'Test on load', 4: 'Auto, manual restore', 5: 'User mode', 6: 'Test off load'};
export const GENSET_BUTTONS = [
  ['auto', 'Auto', 'mdi:autorenew', 'Auto'],
  ['manual', 'Manual', 'mdi:hand-back-right-outline', 'Manual'],
  ['mute', 'Mute alarm', 'mdi:volume-off', null],
  ['off_load', 'To mains', 'mdi:transmission-tower', null],
  ['start', 'Start', 'mdi:power', null],
  ['stop', 'Stop', 'mdi:stop', 'Stop'],
  ['on_load', 'On load', 'mdi:engine', null],
  ['reset', 'Reset alarms', 'mdi:alarm-light-off-outline', null]
];
// Buttons that start, stop or move the load ask first.
const GEN_CONFIRM = {
  auto: 'Put the generator in Auto mode?', manual: 'Put the generator in Manual mode?',
  stop: 'Stop the generator (Stop mode)?', start: 'Start the generator? It must be in Manual mode.',
  on_load: 'Transfer the load to the generator?', off_load: 'Transfer the load back to mains?', reset: 'Reset the generator alarms?'
};

export function gensetSetup(config = {}, hass = {}) {
  const states = hass.states || {};
  const own = config.generator || {};
  const ids = Object.keys(states);
  const find = pattern => ids.find(id => pattern.test(id)) || null;
  const sensor = tail => find(new RegExp(`^sensor\\.${GEN_PREFIX}_(?:.*_)?${tail}$`));
  const script = name => find(new RegExp(`^script\\.${GEN_PREFIX}_${name}$`));
  const setup = {
    name: own.name || 'Generator',
    mode: own.mode ?? sensor('control_mode'),
    rpm: own.rpm ?? sensor('(?:engine_speed|rpm)'),
    frequency: own.frequency ?? sensor('frequency'),
    voltage: own.voltage ?? sensor('(?:l1_n_voltage|l1_voltage|output_voltage)'),
    power: own.power ?? find(/^sensor\.(?:electric_)?generator_(?:.*_)?power$/),
    coolant: own.coolant ?? sensor('coolant_temp(?:erature)?'),
    oil: own.oil ?? sensor('oil_pressure'),
    fuel: own.fuel ?? sensor('fuel_level'),
    battery: own.battery ?? sensor('battery_voltage'),
    // The mains the controller watches isn't always the inverter's grid input, so it is only set by hand.
    mains: own.mains ?? sensor('mains_(?:l1_)?(?:n_)?voltage'),
    scripts: {
      auto: own.scripts?.auto ?? script('auto(?:_mode)?'), manual: own.scripts?.manual ?? script('manual(?:_mode)?'),
      stop: own.scripts?.stop ?? script('stop(?:_mode)?'), start: own.scripts?.start ?? script('start'),
      mute: own.scripts?.mute ?? script('mute(?:_alarms?)?'), reset: own.scripts?.reset ?? script('reset(?:_alarms?)?'),
      on_load: own.scripts?.on_load ?? script('on_load'), off_load: own.scripts?.off_load ?? script('off_load')
    }
  };
  // Only a generator that reports its mode or engine speed gets a card.
  return setup.mode || setup.rpm ? setup : null;
}

// The state list, drawn in the browser from live states (button-card custom field).
export function dwellGenset(states, cfg) {
  const num = id => { const v = Number(states[id]?.state); return id && Number.isFinite(v) ? v : null; };
  const rpm = num(cfg.rpm), hz = num(cfg.frequency), volts = num(cfg.voltage), power = num(cfg.power), mains = num(cfg.mains);
  const modeValue = num(cfg.mode);
  const mode = modeValue === null ? (states[cfg.mode]?.state || '—') : (cfg.modes[modeValue] || `Mode ${modeValue}`);
  const running = (rpm !== null && rpm > 100) || (hz !== null && hz > 5);
  const engine = running ? `Running${rpm ? ` · ${Math.round(rpm)} rpm` : ''}` : 'Engine at rest';
  const output = running && (volts !== null || hz !== null) ? [volts !== null ? `${Math.round(volts)} V` : '', hz !== null ? `${hz.toFixed(1)} Hz` : ''].filter(Boolean).join(' · ') : 'No output';
  const load = power === null ? '—' : power > 50 ? `On load · ${power >= 1000 ? (power / 1000).toFixed(1) + ' kW' : Math.round(power) + ' W'}` : 'Off load';
  const grid = mains === null ? null : mains > 150 ? `Mains OK · ${Math.round(mains)} V` : 'Mains off';
  const rows = [['Engine', engine, running], ['Generator', output, running], ['Load', load, power !== null && power > 50]];
  if (grid) rows.push(['Mains', grid, false]);
  rows.push(['Mode', mode, false]);
  const extra = [['mdi:thermometer', num(cfg.coolant), '°C'], ['mdi:oil', num(cfg.oil), ' kPa'], ['mdi:gas-station', num(cfg.fuel), '%'], ['mdi:car-battery', num(cfg.battery), ' V']]
    .filter(([, v]) => v !== null && v >= 0)
    .map(([icon, v, unit]) => `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:999px;border:1px solid ${cfg.c.line};font-size:12px;color:${cfg.c.muted}"><ha-icon icon="${icon}" style="--mdc-icon-size:15px"></ha-icon>${Math.round(v * 10) / 10}${unit}</span>`).join('');
  const row = ([label, value, on]) => `<div style="display:flex;justify-content:space-between;gap:16px;padding:7px 0;border-bottom:1px solid ${cfg.c.line}"><span style="font-weight:700;color:${cfg.c.text}">${label}</span><span style="color:${on ? cfg.c.onText : cfg.c.muted};text-align:right">${value}</span></div>`;
  return `<div style="display:grid;grid-template-columns:minmax(84px,120px) 1fr;gap:18px;align-items:center;text-align:left">
    <div style="display:grid;place-items:center;aspect-ratio:1;border-radius:22px;background:${running ? cfg.c.on : 'rgba(0,0,0,.22)'};border:1px solid ${running ? cfg.c.onText : cfg.c.line}">
      <ha-icon icon="mdi:engine" style="--mdc-icon-size:44px;color:${running ? cfg.c.onText : cfg.c.muted}"></ha-icon></div>
    <div><div style="font-size:20px;font-weight:800;color:${cfg.c.text};margin-bottom:4px">${cfg.name}</div>${rows.map(row).join('')}
    ${extra ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px">${extra}</div>` : ''}</div></div>`;
}

const gensetButton = (setup, [key, label, icon, mode]) => {
  const script = setup.scripts[key];
  if (!script) return null;
  const tone = key === 'start' ? '#3f9b4f' : key === 'stop' ? '#d24a3c' : null;
  // The current mode's button carries a dot, like the controller's own LED.
  const modeValue = Object.entries(DSE_MODES).find(([, name]) => name === mode)?.[0];
  const dot = mode && setup.mode ? `[[[ return Number(states['${setup.mode}']?.state) === ${modeValue} ? 'block' : 'none' ]]]` : 'none';
  return {
    type: 'custom:button-card', name: label, icon, show_state: false, variables: {dwell_static: true},
    triggers_update: setup.mode ? [setup.mode] : [],
    tap_action: {action: 'perform-action', perform_action: 'script.turn_on', target: {entity_id: script}, ...(GEN_CONFIRM[key] ? {confirmation: {text: GEN_CONFIRM[key]}} : {})},
    hold_action: {action: 'none'},
    custom_fields: {dot: ' '},
    styles: {
      card: [{padding: '10px 4px'}, {background: 'transparent'}, {border: 'none'}, {'box-shadow': 'none'}, {overflow: 'visible'}],
      grid: [{'grid-template-areas': '"i" "n"'}, {'grid-template-rows': '64px auto'}, {'justify-items': 'center'}, {gap: '6px'}],
      img_cell: [{width: '58px'}, {height: '58px'}, {'border-radius': '50%'}, {background: tone || 'rgba(255,255,255,.92)'},
        {border: `2px solid ${tone ? 'rgba(255,255,255,.35)' : GEN_C.line}`}],
      icon: [{width: '28px'}, {color: tone ? '#fff' : '#1b1f24'}],
      name: [{'font-size': '12px'}, {color: GEN_C.muted}, {'white-space': 'normal'}, {'line-height': '1.2'}],
      custom_fields: {dot: [{position: 'absolute'}, {top: '6px'}, {right: 'calc(50% - 34px)'}, {width: '14px'}, {height: '14px'},
        {'border-radius': '50%'}, {background: '#d24a3c'}, {border: '2px solid rgba(255,255,255,.85)'}, {display: dot}]}
    }
  };
};

// The Generator section: the state panel and a row of controller buttons.
export function gensetSection(setup) {
  const watched = [setup.mode, setup.rpm, setup.frequency, setup.voltage, setup.power, setup.coolant, setup.oil, setup.fuel, setup.battery, setup.mains].filter(Boolean);
  const cfg = {...setup, scripts: undefined, modes: DSE_MODES, c: {text: GEN_C.text, muted: GEN_C.muted, line: GEN_C.line, on: GEN_C.on, onText: GEN_C.onText}};
  const panel = {
    type: 'custom:button-card', show_name: false, show_icon: false, show_state: false, show_label: false,
    tap_action: {action: 'none'}, hold_action: {action: 'none'}, triggers_update: watched, variables: {dwell_static: true},
    custom_fields: {genset: touchSafe(`(${dwellGenset.toString()})(states, ${JSON.stringify(cfg)})`)},
    styles: {
      card: [{padding: '18px'}, {'border-radius': '20px'}, {background: `linear-gradient(135deg,${GEN_C.surface},${GEN_C.card})`}, {border: `1px solid ${GEN_C.line}`}, {'box-shadow': 'none'}, {cursor: 'default'}],
      grid: [{'grid-template-areas': '"genset"'}, {'grid-template-columns': '1fr'}],
      custom_fields: {genset: [{width: '100%'}, {'pointer-events': 'auto'}]}
    },
    grid_options: {columns: 'full', rows: 'auto'}
  };
  const buttons = GENSET_BUTTONS.map(item => gensetButton(setup, item)).filter(Boolean);
  const cards = [{type: 'heading', heading: 'Generator', icon: 'mdi:engine', heading_style: 'title'}, panel];
  if (buttons.length) cards.push({type: 'grid', columns: 4, square: false, cards: buttons, grid_options: {columns: 'full'}});
  return {type: 'grid', column_span: 3, cards};
}
