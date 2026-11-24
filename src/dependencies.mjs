// Custom cards and integrations the original design needs, and their install status.
export const DEPENDENCIES = [
  {name:'Button Card',tag:'button-card',owner:'custom-cards',repository:'button-card',category:'plugin'},
  {name:'card-mod',tag:'card-mod',owner:'thomasloven',repository:'lovelace-card-mod',category:'plugin'},
  {name:'Mini Graph Card',tag:'mini-graph-card',owner:'kalkih',repository:'mini-graph-card',category:'plugin'},
  {name:'Browser Mod',service:'browser_mod',owner:'thomasloven',repository:'hass-browser_mod',category:'integration'}
];
export function dependencyStatus(hass, elementRegistry) {
  return DEPENDENCIES.map(item=>({...item,ready:!!(item.service ? hass?.services?.[item.service]?.popup : elementRegistry?.get(item.tag)),
    url:`https://my.home-assistant.io/redirect/hacs_repository/?owner=${item.owner}&repository=${item.repository}&category=${item.category}`}));
}
