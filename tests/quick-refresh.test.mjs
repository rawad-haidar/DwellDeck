import {test} from 'node:test';
import assert from 'node:assert/strict';
globalThis.HTMLElement ??= class {};
globalThis.customElements ??= {get: () => undefined, define: () => {}};
globalThis.window ??= {};
const {refreshTargets, installQuickRefresh} = await import('../src/strategy.mjs');

const st = name => ({state: 'on', attributes: {friendly_name: name}});
const hass = {
  states: {'media_player.tv_adb': st('Kitchen TV'), 'remote.tv': st('Kitchen TV remote'), 'media_player.tv_ma': st('Kitchen TV'),
    'media_player.other': st('Saloon TV'), 'light.a': st('A'), 'script.gen_start': st('Start'), 'sensor.gen_engine_speed': st('Speed')},
  entities: {'media_player.tv_adb': {device_id: 'd1'}, 'remote.tv': {device_id: 'd1'}, 'media_player.tv_ma': {device_id: 'd2'}, 'media_player.other': {device_id: 'd3'}}
};

test('a TV command re-reads that TV through all its integrations, nothing else', () => {
  assert.deepEqual(refreshTargets('remote', 'send_command', ['remote.tv'], hass).sort(), ['media_player.tv_adb', 'remote.tv']);
  assert.deepEqual(refreshTargets('media_player', 'media_pause', ['media_player.tv_adb'], hass).sort(), ['media_player.tv_adb', 'media_player.tv_ma', 'remote.tv'], 'same device, and the Music Assistant copy by name');
  assert.deepEqual(refreshTargets('light', 'turn_on', ['light.a'], hass), [], 'lights report on their own');
  assert.deepEqual(refreshTargets('homeassistant', 'update_entity', ['media_player.tv_adb'], hass), [], 'never re-reads its own re-read');
  assert.deepEqual(refreshTargets('script', 'turn_on', ['script.gen_start'], hass, {'script.gen_start': ['sensor.gen_engine_speed']}), ['sensor.gen_engine_speed'], 'a script brings the sensors it changes');
});

test('after the command is sent, Home Assistant is asked to read the device again', async () => {
  const sent = [];
  const connection = {sendMessagePromise: message => { sent.push(message); return Promise.resolve({}); }};
  const waits = [];
  assert.equal(installQuickRefresh({...hass, connection}, ms => { waits.push(ms); return Promise.resolve(); }), true);
  assert.equal(installQuickRefresh({...hass, connection}), false, 'installed once per connection');
  await connection.sendMessagePromise({type: 'call_service', domain: 'media_player', service: 'media_play', target: {entity_id: 'media_player.other'}});
  await new Promise(resolve => setTimeout(resolve, 0));
  const refreshes = sent.filter(m => m.service === 'update_entity');
  assert.equal(refreshes.length, 2, 'read again twice');
  assert.deepEqual(refreshes[0].service_data.entity_id, ['media_player.other']);
  assert.deepEqual(waits, [1200, 2800], 'about 1 s and 4 s after the command');
  sent.length = 0; waits.length = 0;
  globalThis.__dwellFollowers = {'script.gen_start': ['sensor.gen_engine_speed']};
  await connection.sendMessagePromise({type: 'call_service', domain: 'script', service: 'turn_on', target: {entity_id: 'script.gen_start'}});
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(sent.filter(m => m.service === 'update_entity').length, 3, 'a generator command: read three times, while it cranks');
  delete globalThis.__dwellFollowers;
});
