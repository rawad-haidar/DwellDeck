# Changelog

## 0.9.28 — Curtain and media fixes

- **Media**: sound systems show only a **Sources** tab, and only when they list sources (no Apps tab on a speaker). Player cards side by side end on the same line. **Pause all villa audio** has an icon again (the old one no longer exists in the icon set).
- **Music Assistant on sound system cards**: two buttons, **Music player** (this room's Music Assistant player: now playing, volume, browse music) and **Music Assistant** (DwellDeck's own Music Assistant page, opened with this room's player selected). The player is found by name: the Music Assistant player with the card's own name first ("Master Sound System"), then the room name, then a partial name.
- Sound system cards show what their Music Assistant player plays: title, artist, and the artwork behind the card. Artwork comes through Home Assistant's own image link, so it shows from a phone, remotely or over https too (Music Assistant's own address only works at home over http). TV cards link only to their own Music Assistant player, never to the room's speakers.
- **Player controls**: Previous, Play/Pause and Next instead of the volume buttons, and a **volume slider** under them with mute and the level in %. On a sound system, skipping and volume go to whichever of its players can do it (its Music Assistant player). Players that can only step the volume keep two volume buttons there.
- Floor names in headings start with a capital ("Ground · Kitchen").

- **Curtains**: Open all, Stop all and Close all at the top of the page did nothing; they now open, stop and close every curtain. The same mistake broke the **Pause all audio** buttons on the Music page; they work again.
- Curtain position sliders showed only a small bar: tiles carried a colour value Home Assistant no longer understands. Tiles now use their normal state colour, so sliders show their full track and fill.

## 0.9.27 — Climate, Energy power flow, Security shortcuts

- **Climate** follows Home's arrangement. **Climate now**: the average inside temperature (and outside), how many air conditioners are on, whether heating is on, and a list of everything heating or cooling with its mode and current → target temperature (tap for its controls). **Turn everything off** needs a second tap to confirm. **Heating** (boiler, hot water, valves) sits beside it at the same height. Then **AC scenes** in one row right above **Air conditioners**, then **Thermostats**.
- **Climate history**, full width, with a date dropdown (today, yesterday, last 24 hours, 2 or 3 days, a week, or a day you pick): every room's temperature as a line (hover for values, tap a name to hide it), and under it an **Activity** timeline, one row per air conditioner, thermostat and heating device, with bars for cooling, heating, drying, fan or on (hover a bar for its times).

- **Energy** follows Home's arrangement. Top row: a live **Power flow** (solar on top, grid left, house right, battery below, the inverter in the middle; moving dots show which way power flows and speed up with more power; tap a circle for its sensor) and **Today** (solar produced, home used, battery charged and discharged, from and to the grid).
- Inverters are found by their sensor names (Solarman / Deye style) and added up, so two inverters in parallel show as one house. The house uses each inverter's output power.
- **Energy page sensors** in the dashboard editor: solar, home, battery and grid power, battery level, the sign conventions, and the today and running-total energy sensors. They show what was found; change any to choose your own (several in one field are added up), or press **Find energy sensors automatically again**.
- **Battery on the power chart**: Solar, home and battery power together, plus the battery level (%) on its own 0–100 % scale on the right; battery above zero while charging, below while discharging (whatever sign the inverter uses).
- **Switch lines off**: tap a name or colour in a chart's legend to hide that line or bar (crossed out), tap again to show it; the scale fits what is shown. Works in the large view too.
- **History charts**: hover any point to see every value at that time; negative values (export, discharge) show below a zero line and the scale covers them; tap a chart to open it large with totals, averages, lows and highs, every value in a table, and a CSV download.
- **Several sensors in one field**: for each energy field, choose in DwellDeck setup whether they are **added up** (inverters in parallel; the default for power and kWh), **averaged** (the default for battery level), or drawn **one line each** in the graphs (lighter shades and dashed lines, named by what differs, like Master and Slave).
- **History** with a date dropdown: today, yesterday, the last 2 or 3 days, 1, 2 or 3 weeks, a month, or custom dates. Charts: solar and home kWh, battery and grid kWh (with totals for the range), average solar and home power, and the battery level with its low-to-high band. Hours for up to three days, days beyond. The choice is remembered on each device.

- Security shortcuts are one full-width row of buttons (icon, name, what it opens, and an arrow) instead of small tiles squeezed into one column; nothing is cut off, and on a phone they stack one per row.
- Recent history and Detection history opened the same page; they are one **History** button now.
- Shortcuts sit above Entrance cameras and Camera detection.
- The top row lines up: Status, Alarm and Gates each have a heading and end on the same line. The status card has a fixed height (a long attention list scrolls inside), the alarm panel is at least that tall, and the gate rows grow to fill the column. The note under the gates is gone.

## 0.9.26 — Home and Security in order of importance

- **Security** opens with one status card: the alarm state in large type, pills for safety alerts, open doors and windows, motion, gates and cameras, and a **Needs attention** list (alarm triggered, safety alerts, unlocked gates, open doors and windows, offline cameras, most serious first; each opens its entity). When nothing needs you, it says all clear.
- **Camera detection** is one folding card instead of a tile per camera: folded, it shows how many cameras have detection and what was detected now or last; open, it lists every camera newest detection first (live, not only when the page loads), and each row opens that camera's detection popup. It remembers being open on each device.
- **Snapshot history per camera**: each detection now also saves a dated snapshot in a folder per camera (`media/dwelldeck/snapshots/<camera>/`). The detection popup shows the newest one large with a strip of earlier ones under it, newest first; tap one to see it large. Press **Update detection snapshots** in the dashboard editor once to update the automation.
- **30 days per camera**: the strip shows the last 30 days of snapshots. A nightly automation (03:17) deletes dated snapshots older than 30 days, so each camera keeps a rolling month. Home Assistant cannot delete files on its own, so this needs a `shell_command` in configuration.yaml; the setup button shows it, and creates the cleanup automation once it exists.
- **Detection snapshots**: a row in the detection card and a shortcut open the snapshot folder (`media/dwelldeck/snapshots`) in the Media browser.
- Then the alarm panel top right, **Gates** with each gate's status and its **Unlock** button on one row (the confirmation stays), **Entrance cameras** two across, **Camera detection**, and **Shortcuts** (sensor activity, recent history, all cameras, detection history) in the same style as Home.

- **At a glance** replaces the clock card: greeting, time and date, and status pills for lights, TVs, air conditioning, curtains, open doors and windows, and the alarm. Each pill opens its page; an open door or a triggered alarm shows in red.
- **Rooms in use** shows the room cards only while something in the room is on (lights, a TV, air conditioning, a switch). When nothing is, one card says everything is off.
- **Outside** keeps the weather hero top right, beside the glance card. **Safety** groups alerts, the outdoor alarm and the latest activity. **Energy and climate** shows solar, consumption and battery side by side, then air conditioning.
- **Shortcuts**: the page buttons share one size and layout.
- **TVs and sound systems are separate.** In a room, TVs and Sound systems have their own groups, and room cards show "TV on" and "Music playing" as separate chips. A sound system's card has a speaker icon and no TV wording. A player is a TV when it says so (`device_class`), when its integration is a TV integration (Android TV, Apple TV, webOS, Samsung, Bravia and others), when it has a TV remote, or when its name says TV; Sonos, Music Assistant, DSPPA, Denon, Yamaha and other audio integrations are sound systems. At a glance shows speakers playing when any are.
- Names decide first: a player with "Sound system", "Speaker", "Soundbar" or "Audio" in its name is a sound system; "TV" in the name makes it a TV.
- A TV that is on but not playing (Android TV over ADB reports "idle") shows **TV on**, counts the room as in use and counts in At a glance. Its real TV entries and its remote decide, not a cast entry named after it.
- A room no longer counts as in use, or shows a Playing chip, because a cast or DLNA entry of its TV keeps playing; the TV's main entry decides.

## 0.9.25 — TV off means off

- When a TV card has real TV entries (`device_class: tv`), they decide whether it is on. A cast or speaker entry that keeps playing while the TV is off no longer makes the status, power button or Now playing show the TV as on.

## 0.9.24 — Air conditioners as room temperature

- **Room temperature sensors** also lists air conditioners and thermostats; their current temperature is used and averaged with any sensors chosen.
- A room with no temperature sensor uses its air conditioners' current temperature.

## 0.9.23 — Room temperature

- A room's temperature is the average of its temperature sensors; unavailable sensors are skipped.
- **Edit dashboard → Home Assistant areas and controls → (room) → Room temperature sensors** chooses the sensors for a room, from any area. Chosen sensors replace the room's own and are averaged when there are several.

## 0.9.22 — Room lights button targets

- The room card's lights button sends off only to lights that are on, and on only to lights that are reachable, so an already-off or unreachable device can't fail the whole action.

## 0.9.21 — Fixed room card height

- Room cards have their own fixed height (128px), so cards with and without chips are identical even when the content would stretch the grid row.
- The chip row is exactly one chip high: chips that don't fit whole are hidden instead of being cut off, most important first.

## 0.9.20 — Identical room cards

- Every room card is the same size (two rows of the sections grid), with the icon, name, lights button and chips in the same place on every card.
- The name stays on one line; cards show one row of the three most important chips (alerts and open doors, then temperature, air conditioning, TV, motion). The status strip inside the room still shows them all.

## 0.9.19 — Room card layout fix

- The room's lights button sits top right in every card: the off and on buttons share one slot and Home Assistant's conditional cards show the one that applies. Before, the on button fell into an extra row and squeezed the room name to a few letters.
- Long room names wrap onto a second line instead of being cut off.

## 0.9.18 — Rooms redesign

- Room cards: icon, name and "3 of 9 lights on", a round lights button (turns the room off, or on when all is off), and status chips for temperature, humidity, air conditioning, TV, open curtains, motion, open doors and alerts. Status uses an icon and text, not colour alone.
- A room card glows only when something in it is switched on (lights, TV, running air conditioning, switches); doors, curtains and sensors show as chips instead.
- Two room cards per row in each floor.
- Rooms open with a compact status strip, then Lights, Climate, TV and media, Scenes, Curtains, Switches and Cameras; safety and all sensor tiles move to the end.

## 0.9.17 — TCL HDMI inputs

- On TCL TVs, HDMI 1 to 3 open with TCL's passthrough links (HW15, HW16, HW17): through Android TV Remote (`remote.turn_on`) or ADB (`am start`). Live TV opens TCL's TV app. A TV counts as TCL by its device manufacturer or its installed TCL apps.
- A room with exactly one TV remote pairs it with the room's TV even when their names differ.

## 0.9.16 — Power button follows the TV

- The power button is plain with a grey icon when the TV is off, and filled orange when it is on.
- It updates live and uses the same on/off as the status line and the TV icon; before, it kept the state it had when the page loaded.

## 0.9.15 — Readable apps on TCL Google TVs

- App names for packages seen on TCL Google TVs (Disney+ MEA, Shahid TV, TOD, iQIYI, Yango Play and others); unknown packages split camelCase into words.
- TCL system tools (instructions, suspension, dashboard, exhibit, guard, partner customizer, TCL home) are hidden from Apps.
- TCL's Live TV app goes to Sources; HDMI and Inputs keys stay next to it unless the TV lists HDMI inputs of its own.

## 0.9.14 — Tab bar and HDMI keys

- The Remote, Apps, Sources and Keyboard tabs are a slim segmented bar with the icon beside the label, so they no longer look like the app tiles. The open tab is highlighted.
- A TV that lists only its home screen as a source still gets Live TV, HDMI 1 to 4 and Inputs.
- The remote pad's arrows and OK are centred in their circle.

## 0.9.13 — Sources on every Android TV

- **Sources** offers Home, **Live TV**, HDMI 1 to 4 and Inputs on every Android TV: as keys through Android TV Remote, or as `input keyevent` commands through ADB. ADB-only TVs such as Living Tv now get them too.
- TVs that list inputs of their own (for example HDMI in a source list) show those instead.

## 0.9.12 — App icons

- Apps show their brand icon on the brand colour (Netflix, YouTube, Spotify, Play Store, Plex, Kodi, Twitch, Apple TV and more), using icons built into Home Assistant, so nothing is downloaded. Apps without a brand icon get a tile with their first letter on a colour that stays the same for each app.

## 0.9.11 — Installed TV apps from ADB

- **Apps** lists the apps installed on the TV. Opening the tab (at most once a minute) or pressing **Refresh installed apps** asks ADB for the TV's launchable apps and user-installed apps. The list is remembered in the browser until a newer answer replaces it, so an app drops out only once it is uninstalled.
- ADB's running-apps list no longer feeds Apps, so apps no longer disappear when you open one. It is still used for inputs.
- Apps open with Android TV Remote (`remote.turn_on` with the package) when the TV has it, otherwise through ADB.
- The open tab stays open when the card redraws.

## 0.9.10 — Hidden TV entries lead their card

- A TV entry hidden in Home Assistant still joins its TV and can lead the card. On the Saloon TV the real player was hidden, so the card fell back to the disconnected ADB entry.
- A TV never produces two cards when several of its entries are in a room.
- The browser console shows one line per TV with its entries and where Power, Volume and Play go.

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
