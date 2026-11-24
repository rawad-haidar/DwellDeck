// Live weather hero for the Home page: the card is a window onto the real sky.
// Sky colour follows the sun's actual elevation, the sun or moon sits where it is in the sky,
// weather is drawn as moving layers, and the hourly forecast streams over Home Assistant's websocket.

// Runs inside a button-card JS template, so it must be self-contained (serialised with toString).
function dwellWeatherSky(states, hass, ids) {
  const w = states[ids.weather];
  const sun = states['sun.sun'];
  const pv = ids.solar ? states[ids.solar] : undefined;
  if (!w) return '<div style="padding:20px">Choose a weather entity in DwellDeck setup.</div>';
  const a = w.attributes || {};
  const cond = String(w.state || 'unknown');
  const unit = a.temperature_unit || '°';
  const deg = value => (value === undefined || value === null || !Number.isFinite(Number(value))) ? '—' : `${Math.round(Number(value))}°`;

  // Hourly forecast: subscribe once per entity and keep it on window, so re-renders reuse it.
  const store = (window.__dwellForecast ||= {});
  if (hass?.connection && !store[ids.weather]) {
    store[ids.weather] = {list: null};
    hass.connection.subscribeMessage(event => { store[ids.weather].list = event.forecast || []; },
      {type: 'weather/subscribe_forecast', forecast_type: 'hourly', entity_id: ids.weather})
      .catch(() => { store[ids.weather].failed = true; });
  }
  const forecast = (store[ids.weather]?.list || a.forecast || []).filter(f => Date.parse(f.datetime) > Date.now() - 3600000);

  // Sun: elevation drives the sky colour; day progress drives where the sun sits.
  const elev = Number(sun?.attributes?.elevation ?? -20);
  const night = sun ? sun.state !== 'above_horizon' : cond === 'clear-night';
  const now = Date.now();
  const rise = Date.parse(sun?.attributes?.next_rising || '');
  const set = Date.parse(sun?.attributes?.next_setting || '');
  const todayRise = rise - 86400000;
  const dayProgress = !night && set > todayRise ? Math.min(1, Math.max(0, (now - todayRise) / (set - todayRise))) : 0.5;

  const words = {
    'clear-night': 'Clear', cloudy: 'Cloudy', exceptional: 'Unusual weather', fog: 'Fog', hail: 'Hail',
    lightning: 'Thunderstorms', 'lightning-rainy': 'Thunderstorms and rain', partlycloudy: 'Partly cloudy',
    pouring: 'Heavy rain', rainy: 'Rain', snowy: 'Snow', 'snowy-rainy': 'Sleet', sunny: 'Sunny',
    windy: 'Windy', 'windy-variant': 'Windy and cloudy'
  };
  const storm = cond.startsWith('lightning');
  const rain = ['rainy', 'pouring', 'lightning-rainy', 'snowy-rainy', 'hail'].includes(cond);
  const snow = ['snowy', 'snowy-rainy'].includes(cond);
  const fog = cond === 'fog';
  const cloudCover = storm ? .85 : cond === 'pouring' ? .8 : rain || snow ? .7 : fog ? .65 :
    ['cloudy', 'windy-variant', 'exceptional'].includes(cond) ? .6 : cond === 'partlycloudy' ? .3 : 0;

  // Sky gradient anchors by sun elevation (degrees): night, blue hour, golden hour, morning, day.
  const anchors = [
    [-18, [9, 13, 32], [22, 30, 58]], [-8, [24, 36, 82], [92, 78, 140]], [-2, [52, 70, 128], [232, 138, 96]],
    [6, [70, 112, 178], [246, 190, 132]], [18, [62, 136, 214], [170, 208, 238]], [60, [44, 122, 212], [150, 200, 240]]
  ];
  const lerp = (x, y, t) => x.map((v, i) => Math.round(v + (y[i] - v) * t));
  const at = e => {
    if (e <= anchors[0][0]) return [anchors[0][1], anchors[0][2]];
    for (let i = 1; i < anchors.length; i++) {
      const [e1, t1, b1] = anchors[i];
      const [e0, t0, b0] = anchors[i - 1];
      if (e <= e1) { const t = (e - e0) / (e1 - e0); return [lerp(t0, t1, t), lerp(b0, b1, t)]; }
    }
    return [anchors.at(-1)[1], anchors.at(-1)[2]];
  };
  let [top, bottom] = at(elev);
  const grey = night ? [30, 34, 42] : [112, 122, 134];
  top = lerp(top, grey, cloudCover * .85);
  bottom = lerp(bottom, lerp(grey, [255, 255, 255], night ? 0 : .15), cloudCover * .85);
  const rgb = c => `rgb(${c.join(',')})`;
  const phase = night ? (elev > -6 ? 'Twilight' : 'Night') : elev < 6 ? (dayProgress < .5 ? 'Sunrise' : 'Golden hour') : 'Daylight';

  // Deterministic pseudo-random so particles don't jump on every re-render.
  const rnd = i => { const x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); };
  const layers = [];
  if (night && cloudCover < .5) for (let i = 0; i < 34; i++) layers.push(`<i class="star" style="left:${(rnd(i) * 100).toFixed(1)}%;top:${(rnd(i + 99) * 55).toFixed(1)}%;animation-delay:${(rnd(i + 7) * 4).toFixed(2)}s;opacity:${(.35 + rnd(i + 3) * .6).toFixed(2)}"></i>`);
  // Sun or moon at its place along today's arc.
  if (!night) {
    const x = 8 + dayProgress * 84, y = 78 - Math.sin(Math.PI * dayProgress) * 58;
    layers.push(`<i class="sun" style="left:${x}%;top:${y}%;opacity:${(1 - cloudCover * .75).toFixed(2)}"></i>`);
  } else {
    const age = (((now - Date.UTC(2000, 0, 6, 18, 14)) / 86400000) % 29.530588853 + 29.530588853) % 29.530588853 / 29.530588853;
    const shade = Math.round(Math.cos(age * 2 * Math.PI) * 26) * (age < .5 ? 1 : -1);
    layers.push(`<i class="moon" style="box-shadow:inset ${shade}px 0 0 0 rgba(10,14,30,.88);opacity:${(1 - cloudCover * .7).toFixed(2)}"></i>`);
  }
  const clouds = Math.round(cloudCover * 9);
  for (let i = 0; i < clouds; i++) layers.push(`<i class="cloud" style="top:${(6 + rnd(i + 40) * 38).toFixed(1)}%;width:${(38 + rnd(i + 50) * 34).toFixed(0)}%;animation-duration:${(70 + rnd(i + 60) * 60).toFixed(0)}s;animation-delay:-${(rnd(i + 70) * 120).toFixed(0)}s;opacity:${((night ? .18 : .5) + rnd(i + 80) * .3).toFixed(2)}"></i>`);
  if (fog) for (let i = 0; i < 4; i++) layers.push(`<i class="fog" style="top:${42 + i * 12}%;animation-delay:-${i * 6}s"></i>`);
  const drops = rain ? (cond === 'pouring' || storm ? 70 : 42) : 0;
  for (let i = 0; i < drops; i++) layers.push(`<i class="drop" style="left:${(rnd(i + 200) * 104 - 2).toFixed(1)}%;animation-delay:-${(rnd(i + 300) * 1.2).toFixed(2)}s;animation-duration:${(.55 + rnd(i + 400) * .35).toFixed(2)}s"></i>`);
  if (snow) for (let i = 0; i < 46; i++) layers.push(`<i class="flake" style="left:${(rnd(i + 500) * 100).toFixed(1)}%;animation-delay:-${(rnd(i + 600) * 8).toFixed(2)}s;animation-duration:${(6 + rnd(i + 700) * 5).toFixed(1)}s"></i>`);
  if (storm) layers.push('<i class="flash"></i>');

  // Small line glyphs for the forecast strip.
  const glyph = c => {
    const s = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
    const cloud = '<path d="M7 17h10a4 4 0 0 0 .5-8 5.5 5.5 0 0 0-10.6 1.6A3.3 3.3 0 0 0 7 17z"/>';
    if (c === 'sunny') return `<svg viewBox="0 0 24 24" ${s}><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/></svg>`;
    if (c === 'clear-night') return `<svg viewBox="0 0 24 24" ${s}><path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/></svg>`;
    if (c === 'partlycloudy') return `<svg viewBox="0 0 24 24" ${s}><path d="M8 7.5a3.5 3.5 0 0 1 6.3-1.3"/><path d="M8 4V3M4.5 7.5h-1M5.2 4.7l-.7-.7"/>${cloud}</svg>`;
    if (c.startsWith('lightning')) return `<svg viewBox="0 0 24 24" ${s}>${cloud}<path d="M12 17l-2 4h3l-2 3"/></svg>`;
    if (['snowy', 'snowy-rainy'].includes(c)) return `<svg viewBox="0 0 24 24" ${s}>${cloud}<path d="M9 20h.01M12 22h.01M15 20h.01"/></svg>`;
    if (['rainy', 'pouring', 'hail'].includes(c)) return `<svg viewBox="0 0 24 24" ${s}>${cloud}<path d="M9 19l-1 3M13 19l-1 3M17 19l-1 3"/></svg>`;
    if (c === 'fog') return `<svg viewBox="0 0 24 24" ${s}><path d="M4 9h16M3 13h18M5 17h14"/></svg>`;
    return `<svg viewBox="0 0 24 24" ${s}>${cloud}</svg>`;
  };
  const hours = forecast.slice(0, 6).map((f, i) => {
    const time = i === 0 ? 'Now' : new Date(f.datetime).toLocaleTimeString([], {hour: 'numeric'});
    return `<div class="hour"><span>${time}</span>${glyph(f.condition || cond)}<b>${deg(f.temperature)}</b></div>`;
  }).join('');
  const temps = forecast.slice(0, 24).map(f => Number(f.temperature)).filter(Number.isFinite);
  const range = temps.length ? `Next 24 hours: ${Math.round(Math.min(...temps))}° to ${Math.round(Math.max(...temps))}°` : '';
  const feels = a.apparent_temperature ?? a.feels_like;

  // Live facts: the next sun event as a countdown, wind with its direction, humidity, solar.
  const until = t => { const m = Math.max(0, Math.round((t - now) / 60000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
  const sunEvent = Number.isFinite(rise) && Number.isFinite(set) ? (night ? `Sunrise in ${until(rise)}` : `Sunset in ${until(set)}`) : '';
  const bearing = Number(a.wind_bearing);
  const windArrow = Number.isFinite(bearing) ? `<i class="arrow" style="transform:rotate(${bearing + 180}deg)">↑</i>` : '';
  const facts = [
    sunEvent,
    a.wind_speed != null ? `Wind ${Math.round(a.wind_speed)} ${a.wind_speed_unit || 'km/h'} ${windArrow}` : '',
    a.humidity != null ? `Humidity ${Math.round(a.humidity)}%` : '',
    pv && Number.isFinite(Number(pv.state)) ? `Solar ${Math.round(Number(pv.state))} W` : ''
  ].filter(Boolean).map(f => `<span>${f}</span>`).join('');

  return `<div class="dw-sky" style="background:linear-gradient(180deg,${rgb(top)} 0%,${rgb(bottom)} 100%)">
  <style>
    .dw-sky{position:relative;height:100%;min-height:400px;overflow:hidden;color:rgb(255,255,255);font-variant-numeric:tabular-nums;transition:background 60s linear;text-align:left}
    .dw-sky i{position:absolute;display:block;pointer-events:none}
    .dw-sky .layers{position:absolute;inset:0}
    .dw-sky .star{width:2px;height:2px;border-radius:50%;background:rgb(255,255,255);animation:dw-twinkle 4s ease-in-out infinite}
    .dw-sky .sun{width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;background:radial-gradient(circle,rgba(255,246,214,1) 0 30%,rgba(255,214,140,.55) 46%,rgba(255,190,110,0) 72%);box-shadow:0 0 120px 60px rgba(255,214,150,.28);animation:dw-glow 6s ease-in-out infinite}
    .dw-sky .moon{right:16%;top:16%;width:34px;height:34px;border-radius:50%;background:rgb(236,238,246);filter:drop-shadow(0 0 14px rgba(220,228,255,.45))}
    .dw-sky .cloud{left:-45%;height:44px;border-radius:50%;background:rgb(255,255,255);filter:blur(14px);animation:dw-drift linear infinite}
    .dw-sky .fog{left:-20%;width:140%;height:26px;border-radius:50%;background:rgba(255,255,255,.28);filter:blur(10px);animation:dw-fog 18s ease-in-out infinite alternate}
    .dw-sky .drop{top:-12%;width:1.5px;height:22px;background:linear-gradient(rgba(255,255,255,0),rgba(214,232,255,.8));transform:rotate(12deg);animation:dw-rain linear infinite}
    .dw-sky .flake{top:-6%;width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,.9);animation:dw-snow linear infinite}
    .dw-sky .flash{inset:0;background:rgb(255,255,255);opacity:0;animation:dw-flash 9s infinite}
    .dw-sky .shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.28) 0%,rgba(0,0,0,0) 42%,rgba(0,0,0,0) 58%,rgba(0,0,0,.38) 100%)}
    .dw-sky .now{position:absolute;left:22px;top:18px;right:22px;display:flex;justify-content:space-between;align-items:flex-start;text-shadow:0 1px 12px rgba(0,0,0,.25)}
    .dw-sky .temp{font-size:84px;line-height:.95;font-weight:300;letter-spacing:-.04em}
    .dw-sky .cond{font-size:20px;font-weight:600;margin-top:6px}
    .dw-sky .sub{font-size:14px;opacity:.88;margin-top:4px}
    .dw-sky .phase{font-size:13px;font-weight:600;padding:5px 11px;border-radius:999px;background:rgba(255,255,255,.16);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
    .dw-sky .panel{position:absolute;left:12px;right:12px;bottom:12px;padding:12px 14px;border-radius:14px;background:rgba(12,16,24,.32);backdrop-filter:blur(16px) saturate(1.2);-webkit-backdrop-filter:blur(16px) saturate(1.2);border:1px solid rgba(255,255,255,.14)}
    .dw-sky .hours{display:grid;grid-template-columns:repeat(6,1fr);gap:4px;margin-bottom:10px}
    .dw-sky .hour{display:flex;flex-direction:column;align-items:center;gap:5px;font-size:13px}
    .dw-sky .hour span{opacity:.8}
    .dw-sky .hour svg{width:24px;height:24px}
    .dw-sky .hour b{font-size:16px;font-weight:600}
    .dw-sky .facts{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:13px;opacity:.92}
    .dw-sky .arrow{position:static;display:inline-block;font-style:normal}
    @keyframes dw-twinkle{50%{opacity:.15}}
    @keyframes dw-glow{50%{transform:scale(1.06)}}
    @keyframes dw-drift{to{transform:translateX(260%)}}
    @keyframes dw-fog{to{transform:translateX(12%)}}
    @keyframes dw-rain{to{transform:translate(-60px,520px) rotate(12deg)}}
    @keyframes dw-snow{to{transform:translate(30px,520px)}}
    @keyframes dw-flash{0%,88%,92%,96%,100%{opacity:0}89%,94%{opacity:.55}}
    @media (prefers-reduced-motion:reduce){.dw-sky *{animation:none!important}.dw-sky .cloud{left:10%}}
  </style>
  <div class="layers">${layers.join('')}</div>
  <div class="shade"></div>
  <div class="now">
    <div>
      <div class="temp">${deg(a.temperature)}</div>
      <div class="cond">${words[cond] || cond.replace(/[-_]/g, ' ')}</div>
      <div class="sub">${feels != null ? `Feels like ${deg(feels)}` : ''}${feels != null && range ? '. ' : ''}${range}</div>
    </div>
    <div class="phase">${phase}</div>
  </div>
  <div class="panel">${hours ? `<div class="hours">${hours}</div>` : ''}<div class="facts">${facts}</div></div>
</div>`;
}

// Turns the original sky card into the live weather hero, keeping its entity bindings.
export function liveWeatherCard(card) {
  const solar = (card.triggers_update || []).find(id => typeof id === 'string' && id.startsWith('sensor.'));
  const ids = {weather: card.entity, solar};
  return {
    type: 'custom:button-card',
    entity: card.entity,
    show_name: false, show_icon: false, show_state: false, show_label: false,
    tap_action: {action: 'more-info'}, hold_action: {action: 'none'},
    triggers_update: card.triggers_update,
    custom_fields: {sky: `[[[ return (${dwellWeatherSky.toString()})(states, hass, ${JSON.stringify(ids)}); ]]]`},
    styles: {
      card: [{padding: '0'}, {overflow: 'hidden'}, {'border-radius': '20px'}, {border: 'none'}, {'min-height': '400px'}],
      grid: [{'grid-template-areas': '"sky"'}, {'grid-template-columns': '1fr'}, {'grid-template-rows': '1fr'}, {height: '100%'}],
      custom_fields: {sky: [{'align-self': 'stretch'}, {'justify-self': 'stretch'}, {height: '100%'}]}
    },
    grid_options: {columns: 'full', rows: 7}
  };
}
