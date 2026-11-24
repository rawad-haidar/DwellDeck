# Changelog

## 0.9.2 — TV apps

- Each TV in Rooms and on the Media page gets an **Apps** card listing the apps on the TV, read when the dashboard loads: sources for Apple TV and most players, configured apps (remote activities) for Android TV Remote. Tap an app to open it; the app that is open is highlighted.
- The remote pad gets a **Remote** heading.

## 0.9.1 — TV controls in discovered rooms

- TVs and speakers in rooms built with **Discover rooms** (and on the Media page) now show playback, volume and, when the player lists them, apps, below the media card.
- TVs that have a remote entity from the **Android TV Remote** or **Apple TV** integration get a remote pad: arrows, OK, Back, Home, Power, and **Apps and media**, which opens the player's dialog with Browse media.

## 0.9.0 — Lamplight and live weather

- Replace the Home weather card with a live weather hero: the sky colour follows the sun's real elevation, the sun or moon sits where it is in the sky, and clouds, rain, snow, fog and lightning move across it. It shows a large temperature, the condition in plain words, a 6-hour forecast streamed from Home Assistant, a sunrise or sunset countdown, wind direction, humidity and solar output. Motion stops for reduced-motion preferences.
- The first Home section spans two columns so the weather has room.
- The browser console shows the loaded DwellDeck version, and the dashboard picker shows it too.

## Unreleased — Modular source

- Add the **Lamplight** palette and make it the default: warm, quiet surfaces where colour marks state, with lamplight yellow for lights that are on. Existing dashboards that chose a palette keep it; choose **Ocean blue** for the original colours.
- Palettes now recolour every accent, status colour and border, not only card backgrounds. Colours have one spelling each.
- Use the Atkinson Hyperlegible Next font, loaded from Google Fonts; turn it off with **Use the Atkinson Hyperlegible font** in Edit dashboard or `font: system`.
- Raise all text to at least 12px; air-conditioning status labels are 13px in sentence case.
- Air conditioning counts the units you configured instead of a fixed 6, and hides unselected rows.
- Home opens with the live sky; the "Welcome home" heading and greeting emoji are removed.
- Markdown summaries sit on the page without a card box; controls keep 12px corners and popups 20px.
- Cards no longer slide in on every page or lift on hover; the glow and breathing icon on active devices remain.
- The unavailable colour in history graphs now meets 3:1 contrast.
- Status summaries read as sentences, for example "2 of 4 on" instead of "2 ON · 4 lights".
- Make Security page camera tiles clickable, showing the latest human and vehicle detection snapshots and the live view; **Set up detection snapshots** in Edit dashboard creates the automation that saves them to the login-protected media folder.
- Add camera human and vehicle detection status and recent activity to the Security page (`camera_detection: false` to hide).
- Fix history graphs, mini graphs and entities cards breaking when some of their entities are not selected.
- Split the runtime into focused `src/` modules and move the layout data into `src/data/*.json`; the build no longer reads its own output.
- Add golden tests that lock the generated dashboards, plus bundle and up-to-date checks in CI.
- The module split itself does not change the generated dashboards or the public API.

## 0.8.1 — Areas, activity and colour themes

- Discover rooms from Home Assistant areas, floors and labels.
- Separate room controls from light-only room popups; show active light names.
- Organize curtains, media and camera views, and align Climate monitoring cards.
- Add activity glows, animated icons and reduced-motion support.
- Add Ocean Blue, Emerald, Amethyst, Rosewood and Graphite palettes in Edit dashboard.
- Improve editor styling and preserve live form edits.

## 0.3.0 — Guided installation

- Adds Install in HACS buttons and a three-step quick start.
- Adds a setup dependency checklist with direct install links.
- Includes the original colors without a theme YAML installation.
- Detects dashboard navigation paths automatically.
- Retains the original 15-view layout and entity configuration.

## 0.2.0 — Original design edition

- Restores the original 15-view dashboard, Home page, styling, animated weather, navigation and popup library.
- Adds a dashboard strategy with a visual configuration editor.
- Central entity bindings update templates, graphs, service targets and popup controls together.
- Lighting rooms accept area discovery, entity lists, exclusions and custom titles.
- Includes the matching DwellDeck Midnight theme.
- Replaces the simplified 0.1.0 room-grid edition.
