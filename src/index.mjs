// DwellDeck public API. Importing this module registers the dashboard strategy.
export {ORIGINAL_TEMPLATE, SLOTS, ROOM_TEMPLATES, LABELS, BUILTIN_THEME} from './data.mjs';
export {DEPENDENCIES, dependencyStatus} from './dependencies.mjs';
export {discoveryContext, discoverConfiguration, roomControlEntities, roomEntities} from './discovery.mjs';
export {inferDashboardPath, generateOriginal} from './generator.mjs';
import './strategy.mjs';
