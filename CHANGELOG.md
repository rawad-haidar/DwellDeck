# Changelog

## 0.9.9 — TV buttons reach an entry that supports them

- Power goes to an entry of the TV that can turn on and off, else to the TV remote (`remote.toggle`), else to ADB's power key. Fixes "does not support action media_player.toggle" when a cast or speaker entry led the card.
- Volume and play or pause go to the first entry that supports them.
- Any TV player other than ADB leads the card ahead of cast and speaker entries with the same name.

## 0.9.8 — TV controls by what the TV reports

- A remote that reports the current app is treated as an Android TV remote, whatever integration provides it. Remote keys, Keyboard and the common apps and inputs now work for it.
- The TV's own player leads the card (name, volume, power and status) ahead of an ADB entry; ADB is used only when nothing else can control the TV.
- Now playing shows the TV itself, not a paused stream on another entry with the same name.

## 0.9.7 — TV status from the entry that is on

- A TV's status and Now playing come from whichever of its entries is on: the TV's own player first, then anything playing. An ADB entry that has lost its connection no longer makes the TV look off.
- Android package names become app names (com.google.android.youtube.tv shows as YouTube).
- The remote prefers Android TV Remote or Apple TV and also finds a remote with the same name in the same area when it sits on another device; ADB is the fallback.
- When an Android TV Remote TV lists no apps, **Apps** offers common apps (Netflix, YouTube, Disney+, Prime Video, Spotify, YouTube Music). Add your own in the integration's options to see the TV's list.
- When it lists no inputs, **Sources** offers Home, HDMI 1 to 4 and Inputs, using Android input keys.

## 0.9.6 — TV tabs in place and Now playing

- **Remote**, **Apps**, **Sources** and **Keyboard** open as tabs inside the TV card instead of popups. Browser Mod shows one popup at a time, so the old popups closed the room they were opened from. Tap a tab again to close it.
- **Keyboard** is a text box in the card: type, then press Send or Enter.
- **Now playing** shows the TV's status (Playing, Paused, On or Off), the artwork, the title, the series or artist, and the app.

## 0.9.5 — Live TV apps and one card per TV

- **Apps** and **Sources** popups read the TV's lists when you open them, so they work even if the TV was off when the dashboard loaded. When the TV is off, the popup says to turn it on.
- Apps and Sources buttons appear for every TV that can switch apps or inputs.
- TVs whose names include IP addresses in brackets, or repeat the name ("Saloon TV(192.168.14.187) Saloon TV(192.168.14.246)"), now merge with the other entries for the same TV.
- The card header uses button-card's own icon, name and status, so it lines up on the left.

## 0.9.4 — Compact TV card with popups

- The TV card is compact again: what's on, power, volume and play or pause, and buttons for **Remote**, **Apps**, **Sources** and **Keyboard**. Each opens its own popup.
- **Remote** popup: round pad with OK, then Back, Home and Menu, then volume and mute.
- **Apps** and **Sources** popups show readable names only. Android package names (com.android.systemui and the like) are hidden; common ones such as Netflix and YouTube get their proper names. HDMI inputs, TV and the home screen go to Sources; everything else is an app. The one in use is highlighted.
- Supports the **Android Debug Bridge (androidtv)** integration: the remote uses `androidtv.adb_command`.
- A TV set up through several integrations ("Saloon TV" and "Saloon TV ADB" in the same area) becomes one card, combining the remote, apps and inputs from all of them.
- Fixes the card header: the icon and name now sit on the left.

## 0.9.3 — One card per TV

- Each TV is now one card, in Rooms and on the Media page. It replaces the separate media card, playback tile, Apps card and remote pad from 0.9.1 and 0.9.2.
- The card holds what's on now (the app, title and artist, with the artwork behind it while playing), power, a round remote pad with Back, Home and Menu, volume, mute and play or pause, a keyboard, and apps and inputs.
- **Apps and inputs** combines the Android TV Remote apps (remote activities) and the player's sources, such as HDMI 1. They wrap in rows of four; the one in use is highlighted.
- **Keyboard** (Android TV Remote only) opens a box to type text and sends it to the TV. It needs the integration's option for the current app name and keyboard input turned on. The Apple TV integration can't send text, so Apple TVs have no keyboard key.
- Holding an arrow or a volume key repeats it; holding OK long-presses.
- Speakers and players without a supported remote get the same card without the remote pad.

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
