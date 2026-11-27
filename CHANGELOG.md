# Changelog

## 0.9.62 — A TV's volume moves the TV

- **Fixed: the volume on a TV card could do nothing.** The card set the volume of the TV's DLNA media renderer (or its Music Assistant copy), which only applies to media cast to the TV, not the TV's own speakers. A TV's volume now only uses the TV's own entries.
  - **The card uses the first one that's connected.** That's a slider when ADB is connected; when it isn't, the remote's volume buttons step it up and down.
- **Sound systems are unchanged.**

## 0.9.61 — Generator load from the controller

- **The generator card uses the controller's own output power** when it's in Home Assistant (`sensor.gen_total_power` or `sensor.gen_power`; on a DSE, register 1536). The inverter-side reading only measures what the inverters take from the generator, and it also shows mains power while the generator is off.
  - **The history keeps the inverter-side reading for the time before the controller's sensor existed,** so older runs keep their energy.
  - **Only the controller's own reading marks a run,** so mains power on the inverter side is no longer counted as a run.

## 0.9.60 — Generator on Home

- **The generator's live state is on Home,** under Energy and climate: what the engine is doing (pre-start, cranking, warming up, on or off load, cooling down), with its load, speed, output, frequency, coolant and battery. Tap it to open the Energy page with the buttons and history.
  - It only shows when DwellDeck finds a generator.
  - **To keep it off Home,** untick "Also show its live state on Home" in the generator settings, or set `home: false`.

## 0.9.59 — Generator stages from the controller's status code

- **The generator card reads the DSE status code** (register 786, found as `sensor.gen_status_code`). Pre-start, cranking and stopping now come straight from the controller, so a start shows as Pre-start then Cranking even before the engine speed updates.
  - **Codes, from a real run on a DSE controller:** 0 at rest, 9 pre-start, 5 cranking, 7 running, 11 stopping.
  - **While the code says Running (7),** which covers warm-up, load and cool-down, the card still tells those apart from the readings.
  - **A controller that numbers its stages differently** can set `status_codes` in the generator settings.
- **New Status code field** in the generator settings.

## 0.9.58 — The generator card says what the engine is doing

- **The state chip shows the engine's stage:** cranking, starting, warming up, running on or off load, cooling down after the load comes off, and stopping. A pulsing dot marks the in-between stages.
  - **Worked out from the readings,** with no new sensor needed. Cranking is a slow engine with no output, and starting is speed or frequency still climbing. Warming up is the first few minutes after this page saw a start, or a cold engine. Cooling down is the engine still turning off load just after the load came off. Stopping is a turning engine in Stop mode.
  - **An engine-state sensor wins if you have one.** That is the DSE engine operating state (GenComm page 5, offset 128), set as **Engine state** in the generator settings or found as `sensor.gen_engine_state`.

## 0.9.57 — Readable generator tiles while running

- **The generator card is readable while the engine runs.** Running tiles, chips and the engine icon used light amber text on a solid amber fill, so Speed, Output, Frequency and the state chips were hard to read. They now use the dim amber background with light amber text, like other active cards in DwellDeck.

## 0.9.56 — Cards catch up straight after a press

- **TVs, speakers and the generator update within a second or two after you press a button.** Their integrations (ADB, Modbus and the like) only report every 10–30 seconds, so the card looked stuck. After a command to a TV, speaker or remote, DwellDeck now asks Home Assistant to read the device again straight away and once more a few seconds later. That includes the same TV through its other integrations (ADB, Android TV Remote, Music Assistant). After a generator button, the generator's sensors are read three times, so a start shows while it cranks. Lights are left alone; they report on their own.
- **A more compact generator card:** smaller header, tiles and buttons, and a shorter history chart and run list.

## 0.9.55 — Generator card and history

- **A generator section on the Energy page, laid out like DSE's controller page.**
  - **Header:** the generator's name, its state (at rest, running on load, running off load) and its mode (Auto, Manual, Stop and so on).
  - **Tiles for every reading the controller gives:** load, engine speed, output voltage, frequency, coolant temperature and battery voltage, plus oil pressure and fuel level when fitted.
  - **The controller's buttons:** Auto, Manual, Mute alarm, To mains, Start, Stop, On load and Reset alarms. A red dot marks the current mode, as on the controller.
- **Generator history,** worked out from Home Assistant's recorded history, so no energy meter or hour counter is needed:
  - running time, energy (kWh) and number of starts for the chosen period (today, yesterday, the last 24 hours, or 3, 7 or 10 days);
  - a load chart with the runs shaded;
  - a log of each run with its start and stop, duration, kWh, average and peak load, and highest coolant temperature.

  A run counts whenever the engine turns, there's output frequency, or the generator delivers power, so runs from before a sensor was added still show.
- **Buttons that start, stop or move the load ask first.**
- **Found automatically** for a DSE on Modbus, with sensors and scripts named `gen_…`. It can also be set under `generator:` (name, sensors, scripts, and a mains sensor if you have the controller's own reading).
- **Edit dashboard → Generator**, only for homes that have a generator: set its name, turn the section off, or change or clear any of its sensors. Homes without a generator see neither the section nor these settings.

## 0.9.54 — Rooms left out stay out everywhere

- **Rooms you don't give someone are left out of their other tabs too.** When a limited user's Rooms tab is limited, everything in the rooms left out disappears from their other tabs: lights, air conditioners, curtains, TVs, the pool. Things that belong to no room stay. A tab where you picked cards yourself still shows exactly those, even from a room left out.
- **Narrowing reaches further:** Jinja templates (`{% set room_lights = [...] %}`) and lookup tables in templates (`{"climate.kitchen_ac": "Kitchen AC"}`) lose what wasn't given, like lists already did.
- **A card given to a limited user stays theirs when you add devices.** Cards without a name of their own (Home's summary, "All villa lights", Recently played) were identified by their item count, for example "Summary · 142 items". Adding one light changed the count, and the person quietly lost the card. Such cards are now known by where they are ("Summary · overview"). The editor still shows the count. Cards saved under the old names keep working.

## 0.9.53 — Home follows a limited user's other tabs

- **A limited user's Home shows only what they were given elsewhere.** With no cards picked for Home, it follows their other tabs. The summary at the top counts only their lights, TVs and AC, with no alarm unless it was given. Rooms in use lists only their rooms. "Everything is off" means everything of theirs. AC live status shows only their AC. Home alone, or Home with a whole tab given, is unchanged. In the editor, Home reads "only what the other tabs give" when nothing is ticked.
- **Narrowing reaches inside cards.** When something isn't given, it's also taken out of the lists a card's templates read, the conditions that show or hide the card, and paired lists (a TV with its remote).
- **No shortcuts to pages they don't have.** Home's Shortcuts leave out tabs the person can't see. Other cards that would open such a page stay, but do nothing when tapped.
- **Editor:** "Home Assistant areas and controls" starts closed. It stays open while you add or remove rooms.

## 0.9.52 — Dropdowns for limited users

- **No more long lists.** In Limited users, each ticked tab is a dropdown. Inside it, the cards are grouped under their headings in smaller dropdowns, for example "1ST Floor" on Lights. It works the same on every tab.
- **Share a card, then choose what's on it.** Ticking a card shares it and opens its own dropdown of the things on it, all ticked. Untick a light and that card's popup leaves it out, and its All on and All off skip it.
- **One button of a multi-button switch no longer gives the others.** Only TVs and speakers bring the rest of their device along.

## 0.9.51 — Pick cards, not entities

- **Each tab lists its own cards.** In Limited users, a ticked tab no longer asks you to search every entity in Home Assistant. It lists the cards on that tab, the way Rooms lists rooms, named with the heading above them: for example "Ground · Kitchen · Open all / Close all" on Curtains, or "Heating · Diesel boiler and shared pump" on Climate. Tick the cards the person can see. Ticking none gives them the whole tab.
- Cards showing exactly the same things are one choice (All villa lights on / All villa lights off).
- Earlier choices still show: a card is ticked when everything on it was given before.

## 0.9.50 — Choose what limited users see on each tab

- **Pick what each person sees on every tab.** In Edit dashboard → Limited users you tick the tabs a person can see. Each ticked tab then gets its own picker for areas, devices or entities. For example: Rooms → their bedroom, Media → their TV, Climate → their AC. On that tab, any card showing or controlling something not picked is left out. Leave a picker empty and they see the whole tab. The separate My room page is gone.
- **Rooms picked for the Rooms tab are the only rooms built for that person**, so their Home and Lights pages list only those rooms too.
- **Protection follows what you picked.** Devices and entities you pick are theirs to use. A picked area gives them its lights, TVs, air conditioners and curtains, but not, say, a boiler switch in that room. Everything else is set back.
- Settings from 0.9.46–0.9.49 keep working: a person with rooms but no tabs gets the Rooms tab with those rooms.

## 0.9.49 — Choose tabs for limited users

- **Give a limited user other tabs too.** In Edit dashboard → Limited users, each person now has a tab picker next to their rooms, for example Media, Music Assistant or Weather. They see My room first, then only the tabs you ticked. Tabs alone (no rooms) are fine too.
- A picked tab brings along the sub-pages it opens, such as Weather from Home. The Device directory never comes along this way. Security sensors and the camera wall come along only when Security itself is picked.
- Protection still applies on those tabs: changes outside the person's rooms are set back.

## 0.9.48 — Protection for limited users

- **Limited users can no longer change what isn't theirs.** Edit dashboard → Limited users has a new Protection part. Save protection creates a Home Assistant automation, "DwellDeck · Guard", that sets back anything a limited user changes outside their rooms and leaves you a notification. That covers switches such as the boiler and pool filter, valves, other rooms' air conditioners, curtains, locks and automations. Their own rooms' lights, TVs and air conditioners are left alone.
- **Protect anything extra.** Pick devices under "Also protect these" and they're set back for every limited user, even in their own rooms.
- Press Save protection again after changing users, rooms or devices. With no limited users left, it removes the guard.

## 0.9.47 — Limited users in the editor

- **Set up limited users without YAML.** Edit dashboard now has a Limited users section that lists your non-administrator users. Pick rooms for someone and they get only the My room page for those rooms. Clear the rooms to give them the full dashboard back. Administrators and Home Assistant's own system accounts aren't listed.

## 0.9.46 — Kids' mode

- **Kids' mode.** List a child's Home Assistant user and rooms under `kids`, and when they open DwellDeck they see one page, My room, with only their rooms' lights, TVs and air conditioners. Nothing else is built for them: no other rooms, security, cameras, alarm or energy. Holding a tile opens nothing, so the details dialog (history, related entities) is out of reach too. Everyone else gets the full dashboard as before.
- This limits what DwellDeck shows, not what Home Assistant allows. The README explains how to pair it with non-admin accounts and admin-only dashboards.

## 0.9.45 — Every alarm mode on the alarm card

- **The alarm card offers every mode your alarm supports.** Home Assistant's alarm card shows only Arm home and Arm away unless told otherwise, so Arm night, Arm vacation and Arm custom bypass were missing even when Alarmo offered them. The card now lists the modes the alarm reports. Alarmo reports the modes that are enabled in its own settings.

## 0.9.44 — Room popups on phones

- **Room popups fill the phone screen.** browser_mod's wide popup is 90% of the screen and not centred, so on an iPhone the cards stopped well short of the right edge. On screens narrower than 600 px, popups now use the full width, with even margins.
- **Light and switch names in popups show in full.** Names wrap onto two lines instead of every tile reading "Kitchen Switch…".
- **The lights heading in a room popup names that room.** It said "Saloon" in every room.

## 0.9.43 — Dashboard builds almost twice as fast

- **The dashboard is built in about half the time.** Each time it opens (and each time the phone app comes back and reloads), DwellDeck builds the whole dashboard from Home Assistant's registries. To decide which entities belong to each room and whether a device has a camera, it scanned all entities again for every room and every entity checked. On a home with about 2,000 entities that took more than half of the build. DwellDeck now indexes the registries once per build. Measured on a real home in Chrome on a Mac: 395 ms → 220 ms, with identical output. Slower devices like phones save proportionally more.

## 0.9.42 — All off right after All on is not an error

- **A newer All on / All off press takes over from an older one.** Pressing All off within a few seconds of All on showed "lights did not turn on" for every light, because All on checked its lights after All off had already switched them off. Now the newer press takes over every light it covers: the older one sends nothing more to those lights and does not report them, so an All on still running can no longer switch a light back on after All off.
- A light named twice in the message (two switches with the same name) is listed once.

## 0.9.41 — Room card lights button, one light at a time

- **The lights button on each room card** (the round button on Home and Rooms) now switches the lights one at a time too, like All on / All off. So do All on / All off in rooms that include switches, which still sent one command for everything.
- Lights already on (for "on") or off (for "off"), and unreachable lights, are left alone, so the hub only gets the commands that change something.

## 0.9.40 — All on / All off, one light at a time (safely)

- **All on / All off switch the lights one at a time.** They sent one command for every light at once, which LifeSmart hubs could not keep up with: confirmations went missing and one late light failed the whole tap. DwellDeck now sends one light, waits until the hub confirms it (up to 1.2 s), pauses 250 ms, then sends the next, so a hub never has more than one command from the button at a time. A few seconds after the last light, only a light that is really not on (or off) is named in a message; a late confirmation is not an error.
- Unlike 0.9.39 (withdrawn), the button holds no code, only a signal that DwellDeck's own code handles when the button is tapped: opening a room does nothing to its lights.

## 0.9.38 — Faster on phones

- **Pages open faster, most of all on phones.** A 2.8 KB block of DwellDeck's colour variables was copied into almost every card (over 2,000 on a large home, about a third of the whole dashboard), and card-mod had to apply each copy card by card as a page opened, which on a phone showed as cards appearing late and shifting. The variables are now set once on the dashboard's view and on browser_mod's popup, and every card inherits them. Identical values for every palette (checked palette by palette, including the design pass on corner radii); measured on a real home: about 3 MB less to build and load, and over 2,000 fewer styles to apply.

## 0.9.37 — TV apps open again

- **Apps in a TV's Apps tab open again.** Since 0.9.31 a TV added through both Android integrations (the Living TV) opened its installed apps through Android TV Remote, which asks the TV to open them as Play Store links. The TV refuses that for apps installed another way (OnPlus, Cablevision Plus) and drops its connection each time. Installed apps now open through ADB whenever the TV has it, with the TV launcher's entry first and the phone launcher's for apps that have no TV entry. Android TV Remote still opens apps on TVs without ADB, and the common apps shown before the installed list is loaded.

## 0.9.36 — Phones and tablets

- **Buttons inside cards work on a phone.** button-card listens for taps on the whole card and cancels the end of every touch on it, so on a touch screen the buttons, tabs, menus and sliders drawn inside DwellDeck's cards often never got their press (with a mouse they did). Affected: the player cards' Music player and Music Assistant buttons, Remote / Apps / Sources / Keyboard tabs and volume slider, Recently played, the Home pills and energy, Security status and shortcuts, Climate status and history, the Energy flow and history, and camera detections. Touches inside these areas now stay with the buttons. Measured: the touch was cancelled before, and is not now.
- **The Music Assistant page fills the screen on a phone.** Its card kept a box 80% as tall as it is wide, about 300px on a phone, and cut the app off; the app now fills the screen's height on any screen.

## 0.9.35 — Page colours and the blur fix, for real

- **The page background is DwellDeck's palette colour**, not the Home Assistant theme's (Alpine Morning's teal and amber glow): behind the cards, and on the browser page itself, so the strip a phone has not painted yet while scrolling no longer flashes the theme's colour.
- **The theme's frosted-glass blur behind cards is really off now.** 0.9.34 set it on each view, but Home Assistant does not apply a style set on a sections view, so it never took effect (124 blurred elements were still on the Media page). The page colours, the palette's accent for Home Assistant's own cards and the blur setting now go into the dashboard's root, where the new tabs already go; measured live: 0 blurred elements. Other dashboards and the rest of Home Assistant keep the theme as it is.

## 0.9.34 — Smooth scrolling

- **Button labels are centred with their icon again**: in Music player, Music Assistant, and the Remote, Apps, Sources and Keyboard tabs, the label was pushed to the far edge of the button (button-card gives every icon automatic margins, which took all the free space).
- **Cards no longer stay blank for a moment while scrolling** (most visible on the Media page on phones and tablets). A Home Assistant theme can put a frosted-glass blur behind every card (Alpine Morning does); on DwellDeck's solid cards it is invisible, but it had to be recomputed for every card and every button inside it (52 on the Media page) while scrolling. DwellDeck pages now turn that blur off; the theme is unchanged everywhere else, and DwellDeck's own frosted panels (the weather sky) keep theirs.

## 0.9.33 — Faster pages

- **Lighter dashboard, faster pages.** TV and sound system cards and room status chips used to carry their own copy of the same code (the TV remote panel, the volume slider, the Music Assistant buttons, the "what's playing" logic and the list of app names, that one up to seven times per card). That code is now loaded once and every card refers to it, so the generated dashboard is about 44% smaller: the Media page about 62% smaller, Home and Rooms about half. The browser reads and runs far less when a page opens, most noticeably on phones and tablets. Every card draws exactly what it drew before (checked template by template, in two palettes).

## 0.9.32 — Modern tabs

- **The dashboard's tab bar** (Home, Rooms, Lights, …) is restyled: each tab is a rounded pill, the open tab is filled with the palette's accent (amber in Lamplight, cyan in Ocean blue, and so on) with a soft glow, and the other tabs light up under the pointer with their icon lifting slightly. The old underline is gone. It only applies on DwellDeck dashboards, follows the chosen palette, and respects reduced motion. Set `modern_tabs: false` in the dashboard's configuration to keep Home Assistant's own tabs.

## 0.9.31 — One card per Android TV, Recently played on top

- **An Android TV added through both Android TV integrations is one TV**, even when they named it differently ("Living Tv" by Android Debug Bridge, "Living 2F TV Pro" by Android TV Remote): when a room has one TV of each, they are the same TV. The card keeps the name you gave the TV, and shows the app from Android TV Remote (ADB on newer Google TVs keeps reporting the home screen). Its remote, room chip and Recently played use both.
- **Artwork is back on sound system cards.** Since 0.9.29 the amplifier zone leads the card (so power reaches it directly), and the zone reports the song's title but not its artwork, so the card stopped showing it. The card now takes the song from whichever entry has the artwork (the Music Assistant player), and the app label next to Playing is that entry's (Music Assistant, not the zone's input).
- **Recently played** is now at the top of the Media page, under the Music Assistant buttons. The list scrolls inside the card, so the players stay close below.

## 0.9.30 — What's playing, and what played

- **Room cards and room status strips**: a TV that is on shows what it is on, such as **TV · Netflix**, **TV · YouTube** or **TV · Home** (the home screen), and what plays in it when the TV says (**TV · Netflix · Stranger Things…**). The app comes from the TV remote's current app, else the TV's app or input. With no app known it still says **TV on** or **TV playing**, and two TVs on show **2 TVs on**.
- **TV and sound system cards** show the title, artist and artwork from whichever entry of the TV has them (its Cast or Music Assistant entry too), not only the main one. DLNA entries are left out, as they keep an old title long after it stopped.
- **Media page cards are all one size**: every TV and sound system card has the same width (a room with one player takes one column, so the next room sits beside it), the same height, and its rows at the same place: header, now playing, buttons, volume and Music Assistant buttons line up across cards. The now-playing box keeps its size with or without artwork.
- **Recently played** at the bottom of the Media page: what every TV and sound system played, newest first and grouped by day, with the time, how long, the player and the app. Pick **Today**, **Yesterday**, **Last 3 days**, **Last week** or **Last 10 days**, and one player or all (tap a player's name to see only that one). Songs show title and artist; a TV app with no title shows the app (Netflix, YouTube, Shahid…). The same song on a zone and its Music Assistant copy counts once; the home screen, settings, the store, system apps and an amplifier's input name are left out. It reads Home Assistant's history, so it reaches back as far as the recorder keeps (10 days by default).

## 0.9.29 — Sound system power goes straight to the amplifier

- **Sound system cards**: power, volume and playback go to the zone itself (the DSPPA zone), not to its Music Assistant copy. On cards whose Music Assistant copy sorted first by name (M.Kitchen, Living, Pergola, Bar) the power button went through Music Assistant, which turned the zone on and off slowly or not at all. The **Music player** and **Music Assistant** buttons and the artwork still use the Music Assistant player.
- Tests no longer fail when run just after midnight.

## 0.9.28 — Curtain and media fixes

- **Media**: sound systems show only a **Sources** tab, and only when they list sources (no Apps tab on a speaker). Player cards side by side end on the same line. **Pause all villa audio** has an icon again (the old one no longer exists in the icon set).
- **Music Assistant on sound system cards**: two buttons, **Music player** (this room's Music Assistant player: now playing, volume, browse music) and **Music Assistant** (DwellDeck's own Music Assistant page, opened with this room's player selected). The player is found by name: the Music Assistant player with the card's own name first ("Master Sound System"), then the room name, then a partial name.
- Sound system cards show what their Music Assistant player plays: title, artist, and the artwork behind the card. Artwork comes through Home Assistant's own image link, so it shows from a phone, remotely or over https too (Music Assistant's own address only works at home over http). TV cards link only to their own Music Assistant player, never to the room's speakers.
- **Player controls**: Previous, Play/Pause and Next instead of the volume buttons, and a **volume slider** under them with mute and the level in %. On a sound system, skipping and volume go to whichever of its players can do it (its Music Assistant player). Players that can only step the volume keep two volume buttons there.
- The Media page's **Music library** button opened Music Assistant too; it is now **Media browser** and opens Home Assistant's media browser, next to the **Music Assistant** button.
- **Music Assistant page in DwellDeck's colours**: the app's background, panels, accent colour, text and font follow the dashboard's palette (read from the page, so any palette works), and stay after the app reloads. The app stays hidden until it has the colours, so its own colours never flash.
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
