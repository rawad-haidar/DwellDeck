// Security view: live human and vehicle detection status and recent activity per camera.
// Sensors are discovered by name, like the Activity view's detection status card.

// Collects one row per human/vehicle binary sensor and kind into ns.rows: {cam, kind, on, unavailable, t}.
// The camera name is the sensor name without its detection words, e.g. "Front Gate Smart Motion Human" -> "Front Gate".
const DETECTION_SCAN = `{%- set ns = namespace(rows=[]) -%}
{%- for s in states.binary_sensor -%}
  {%- set label = (s.entity_id ~ ' ' ~ s.name) | lower -%}
  {#- A sensor named for both, like "Human Vehicle Detection", counts as both, as in the Activity view. -#}
  {%- set kinds = (['human'] if ('person' in label or 'human' in label) else []) + (['vehicle'] if ('vehicle' in label or 'car detection' in label) else []) -%}
  {%- set cam = s.name | regex_replace('(?i)(smart motion|authorized|person|human|vehicle|car detection|detection)', '') | regex_replace(' +', ' ') | trim -%}
  {%- for kind in kinds -%}
    {%- set ns.rows = ns.rows + [{'cam': cam or s.name, 'kind': kind, 'on': s.state == 'on', 'unavailable': s.state in ['unavailable', 'unknown'], 't': s.last_changed}] -%}
  {%- endfor -%}
{%- endfor -%}`;

const NO_SENSORS = `No human or vehicle detection sensors found yet. Name your camera detection binary sensors with **person**, **human**, **vehicle** or **car detection**, for example *Front Gate Human*.`;

const STATUS = `${DETECTION_SCAN}
### Detection status
{% if not ns.rows %}${NO_SENSORS}{% else -%}
{%- for title, icon, kind in [('Human', '🧍', 'human'), ('Vehicle', '🚗', 'vehicle')] -%}
{%- set rows = ns.rows | selectattr('kind', 'eq', kind) | list -%}
{%- set active = rows | selectattr('on') | map(attribute='cam') | unique | list -%}
{%- set recent = rows | rejectattr('unavailable') | sort(attribute='t', reverse=true) | list -%}
{{ icon }} **{{ title }}** · {% if not rows %}no sensors found{% elif active %}**Detected now:** {{ active | join(', ') }}{% elif recent %}Clear · last activity **{{ recent[0].cam }}**, {{ relative_time(recent[0].t) }} ago{% else %}all sensors unavailable{% endif %}

{% endfor %}
{%- set counts = namespace(parts=[]) -%}
{%- for title, kind in [('Human', 'human'), ('Vehicle', 'vehicle')] -%}
{%- set rows = ns.rows | selectattr('kind', 'eq', kind) | list -%}
{%- set offline = rows | selectattr('unavailable') | list | count -%}
{%- set counts.parts = counts.parts + [title ~ ': ' ~ (rows | count) ~ ' sensor' ~ ('' if rows | count == 1 else 's') ~ ((' (' ~ offline ~ ' unavailable)') if offline else '')] -%}
{%- endfor %}

_{{ counts.parts | join(' · ') }}_
{%- endif %}`;

const RECENT = `${DETECTION_SCAN}
{%- macro cell(rows, kind) -%}
{%- set m = rows | selectattr('kind', 'eq', kind) | sort(attribute='t', reverse=true) | list -%}
{%- if not m -%}—
{%- elif m | selectattr('on') | list -%}**Detected now**
{%- elif m | rejectattr('unavailable') | list -%}{%- set last = (m | rejectattr('unavailable') | list)[0] -%}Clear · {{ relative_time(last.t) }} ago
{%- else -%}Unavailable
{%- endif -%}
{%- endmacro %}
### Recent camera activity
{% if not ns.rows %}${NO_SENSORS}{% else -%}
{#- Active detections first, then most recent activity, then cameras whose sensors are all unavailable. -#}
{%- set by_time = ns.rows | sort(attribute='t', reverse=true) -%}
{%- set active = by_time | selectattr('on') | map(attribute='cam') | unique | list -%}
{%- set available = by_time | rejectattr('unavailable') | map(attribute='cam') | unique | reject('in', active) | list -%}
{%- set cams = active + available + (by_time | map(attribute='cam') | unique | reject('in', active + available) | list) %}
| Camera | 🧍 Human | 🚗 Vehicle |
|:--|:--|:--|
{% for cam in cams[:12] -%}
{%- set rows = ns.rows | selectattr('cam', 'eq', cam) | list -%}
| {{ cam }} | {{ cell(rows, 'human') }} | {{ cell(rows, 'vehicle') }} |
{% endfor %}
{%- if cams | count > 12 %}
_+{{ cams | count - 12 }} more cameras._
{% endif %}
_Active detections first, then most recent. Times are each sensor's last change, so "Clear · 3 minutes ago" means a detection ended then._
{%- endif %}`;

const detectionStyle = () => ({style: 'ha-card { background: linear-gradient(135deg, #1b2d40, #101c2b); color: #edf5ff; border: 1px solid rgba(156,199,225,.12); border-radius: 16px; --primary-text-color: #edf5ff; --secondary-text-color: #91a8bd; --primary-color: #29d5ee; } ha-markdown table {width: 100%; border-collapse: collapse;} ha-markdown th, ha-markdown td {padding: 6px 8px; border-bottom: 1px solid rgba(156,199,225,.12); text-align: left;}'});

export function cameraDetectionSection(prefix) {
  return {type: 'grid', column_span: 2, cards: [
    {type: 'heading', heading: 'Camera detection', icon: 'mdi:cctv'},
    {type: 'markdown', content: STATUS, grid_options: {columns: 12, rows: 'auto'}, card_mod: detectionStyle()},
    {type: 'markdown', content: RECENT, grid_options: {columns: 12, rows: 'auto'}, card_mod: detectionStyle()},
    {type: 'button', name: 'Detection history', icon: 'mdi:history', icon_height: '30px', show_state: false,
      tap_action: {action: 'navigate', navigation_path: `${prefix}/notifications`}, grid_options: {columns: 6, rows: 2},
      card_mod: {style: 'ha-card { background: linear-gradient(135deg, #1b2d40, #101c2b); border: 1px solid rgba(156,199,225,.12); border-radius: 16px; --primary-text-color: #edf5ff; --secondary-text-color: #91a8bd; }'}}
  ]};
}
