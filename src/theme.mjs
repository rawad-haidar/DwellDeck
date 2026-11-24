// Built-in colours, selectable palettes and the animated "living" design layer.
import {walk, visit} from './util.mjs';
import {BUILTIN_THEME} from './data.mjs';

export function addBuiltinColors(dashboard) {
  const variables=Object.entries(BUILTIN_THEME).filter(([key,value])=>key!=='modes'&&typeof value==='string').map(([key,value])=>`--${key}:${value};`).join('');
  const css=`:host {${variables}} ha-card {color:var(--primary-text-color);background:var(--ha-card-background);border-radius:var(--ha-card-border-radius);}`;
  for(const view of dashboard.views){delete view.theme;view.card_mod={...view.card_mod,style:`:host{${variables}}`};}
  visit(dashboard,item=>{
    const nativeCards=['markdown','tile','button','entities','history-graph','thermostat','picture-entity','alarm-panel','weather-forecast','media-control'];
    if(!nativeCards.includes(item.type)&&!item.type?.startsWith('custom:'))return;
    if(!item.card_mod)item.card_mod={style:css};
    else if(typeof item.card_mod.style==='string')item.card_mod.style=css+'\n'+item.card_mod.style;
    else if(item.card_mod.style&&typeof item.card_mod.style==='object')item.card_mod.style={...item.card_mod.style,'.':css+'\n'+(item.card_mod.style['.']||'')};
    else item.card_mod.style=css;
  });
}
export const DWELL_PALETTES = {
  ocean: {name:'Ocean blue', colors:['#1b2d40','#101c2b','#172638','#4b9aee'], page:'#080f1b'},
  emerald: {name:'Emerald', colors:['#183d38','#102823','#15342e','#4cc9a6'], page:'#081712'},
  violet: {name:'Amethyst', colors:['#332547','#1d152e','#2b203c','#b294ef'], page:'#100b1b'},
  rose: {name:'Rosewood', colors:['#432b38','#291a25','#36222f','#e49db9'], page:'#190e16'},
  slate: {name:'Graphite', colors:['#303944','#1c222b','#28313c','#a4bfd8'], page:'#10141b'}
};
export function applyDwellPalette(dashboard, key) {
  const palette=DWELL_PALETTES[key] || DWELL_PALETTES.ocean;
  if(key==='ocean' || !DWELL_PALETTES[key])return dashboard;
  const originals=['#1b2d40','#101c2b','#172638','#4b9aee'];
  const replacements=new Map(originals.map((color,index)=>[color,palette.colors[index]]));
  const themed=walk(dashboard,text=>text.replace(/#1b2d40|#101c2b|#172638|#4b9aee/gi,color=>replacements.get(color.toLowerCase())));
  for(const view of themed.views){
    view.card_mod ||= {};
    view.card_mod.style=(view.card_mod.style || '')+`
:host {--primary-color:${palette.colors[3]};--accent-color:${palette.colors[3]};--lovelace-background:linear-gradient(135deg,${palette.page},${palette.colors[1]});--primary-background-color:${palette.page};--ha-card-background:${palette.colors[0]};--card-background-color:${palette.colors[0]};background:linear-gradient(135deg,${palette.page},${palette.colors[1]})!important;}`;
  }
  return themed;
}

// Motion follows actual entity activity; reduced-motion preferences remain respected.
export function addLivingDesign(dashboard) {
  const motion = `
    @keyframes dwell-breathe { 0%,100% {filter: brightness(1);} 50% {filter: brightness(1.14);} }
    @keyframes dwell-arrive {from {opacity:.65; transform:translateY(6px);} to {opacity:1;transform:none;} }
    ha-card {transition:background .7s ease,border-color .7s ease,box-shadow .7s ease,transform .25s ease;
      animation:dwell-arrive .45s ease both;}
    @media (hover:hover) {ha-card:hover {transform:translateY(-2px);box-shadow:0 10px 30px rgba(0,0,0,.22);}}
    @media (prefers-reduced-motion:reduce) {ha-card,ha-state-icon {animation:none!important;transition:none!important;transform:none!important;}}
  `;
  visit(dashboard, card => {
    if (card.type === 'custom:button-card') {
      const ids = (Array.isArray(card.triggers_update) ? card.triggers_update : [card.entity]).filter(id => typeof id === 'string' && /^(light|switch|cover|climate|media_player|fan)\./.test(id));
      if (!ids.length) return;
      const active = `const ids=${JSON.stringify(ids)}; return ids.some(id=>{const e=states[id];if(!e)return false;if(id.startsWith('climate.'))return ['heating','cooling','drying','fan'].includes(e.attributes?.hvac_action);return ['on','playing','opening','closing'].includes(e.state);});`;
      card.styles ||= {};
      card.styles.card ||= [];
      card.styles.card.push({transition:'background .7s ease, border-color .7s ease, box-shadow .7s ease, transform .25s ease'},
        {'box-shadow':`[[[ return (()=>{${active}})() ? '0 0 22px rgba(255,196,90,.16), inset 0 1px 0 rgba(255,223,163,.12)' : '0 5px 18px rgba(0,0,0,.12)'; ]]]`});
      card.styles.icon ||= [];
      card.styles.icon.push({animation:`[[[ return (()=>{${active}})() ? 'dwell-breathe 3.6s ease-in-out infinite' : 'none'; ]]]`});
      card.extra_styles = (card.extra_styles || '') + motion;
    } else if (['tile','thermostat','media-control','picture-entity','markdown','history-graph','logbook'].includes(card.type)) {
      let style = motion;
      if (card.entity && /^(light|switch|cover|climate|media_player|fan)\./.test(card.entity)) {
        const id=JSON.stringify(card.entity);
        style += `{% set e = states[${id}] %}
          {% set active = e is not none and (e.state in ['on','playing','opening','closing'] or e.attributes.get('hvac_action') in ['heating','cooling','drying','fan']) %}
          ha-card {box-shadow:{% if active %}0 0 24px rgba(255,196,90,.18), inset 0 1px 0 rgba(255,223,163,.12){% else %}0 5px 18px rgba(0,0,0,.12){% endif %};}
          ha-state-icon {animation:{% if active %}dwell-breathe 3.6s ease-in-out infinite{% else %}none{% endif %};}`;
      }
      if (!card.card_mod) card.card_mod={style};
      else if(typeof card.card_mod.style==='string') card.card_mod.style += '\n'+style;
      else if(card.card_mod.style && typeof card.card_mod.style==='object') card.card_mod.style['.']=(card.card_mod.style['.']||'')+'\n'+style;
    }
  });
  const home=dashboard.views.find(view=>view.path==='home');
  let greeted=false;
  visit(home, card=>{
    if(!greeted && card.type==='markdown' && card.content?.includes('now().strftime')) {
      card.content = `{% set hour = now().hour %}\n### {% if hour < 12 %}Good morning ☀️{% elif hour < 18 %}Good afternoon 🌤️{% else %}Good evening ✨{% endif %}\n` + card.content;
      greeted=true;
    }
  });
}
