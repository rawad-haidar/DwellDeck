// Sanitized dashboard data. The build inlines these JSON files into dwelldeck.js.
import ORIGINAL_TEMPLATE from './data/template.json' with {type: 'json'};
import SLOTS from './data/slots.json' with {type: 'json'};
import ROOM_TEMPLATES from './data/room-templates.json' with {type: 'json'};
import LABELS from './data/labels.json' with {type: 'json'};
import BUILTIN_THEME from './data/builtin-theme.json' with {type: 'json'};

export {ORIGINAL_TEMPLATE, SLOTS, ROOM_TEMPLATES, LABELS, BUILTIN_THEME};
