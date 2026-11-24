// Dashboard strategy and custom element registration.
import {discoveryContext} from './discovery.mjs';
import {generateOriginal} from './generator.mjs';
import {DwellDeckOriginalEditor} from './editor.mjs';
import {ORIGINAL_TEMPLATE, SLOTS, ROOM_TEMPLATES} from './data.mjs';

class DwellDeckOriginalStrategy extends HTMLElement {
  static configRequired=true;
  static getConfigElement(){return document.createElement('dwelldeck-original-editor');}
  static getCreateSuggestions(){return {title:'DwellDeck',icon:'mdi:view-dashboard'};}
  static async generate(config, hass) {
    // Camera detection links sensors to cameras on the same device, so it needs the registries too.
    const needsDiscovery = config.auto_discover || config.room_controls || config.camera_detection !== false ||
      Object.values(config.rooms || {}).some(room => room.area) ||
      (config.extra_rooms || []).some(room => room.area);
    const context = needsDiscovery ? await discoveryContext(hass) : hass;
    return generateOriginal(ORIGINAL_TEMPLATE, SLOTS, ROOM_TEMPLATES, config, context);
  }
}
if(!customElements.get('dwelldeck-original-editor'))customElements.define('dwelldeck-original-editor',DwellDeckOriginalEditor);
if(!customElements.get('ll-strategy-dashboard-dwelldeck-original'))customElements.define('ll-strategy-dashboard-dwelldeck-original',DwellDeckOriginalStrategy);
window.customStrategies=window.customStrategies||[];
if(!window.customStrategies.some(s=>s.type==='dwelldeck-original'))window.customStrategies.push({type:'dwelldeck-original',strategyType:'dashboard',name:'DwellDeck · Original design',description:'The original Home page, navigation, styled cards and room popups with visual entity setup.'});
