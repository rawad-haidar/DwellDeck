# DwellDeck

**Your command center. Your entities. The original design.**

DwellDeck packages the original multi-view Home Assistant command center: its Home page, animated weather, dark navy styling, navigation tabs, status summaries, room controls, history graphs, security pages and popups. Version 0.8.1 builds on the original-design edition and replaces the simplified room-grid prototype.

## New in 0.8.1

Use **Edit dashboard → Discover rooms and devices** to organize rooms from Home Assistant areas, floors and labels. The Rooms tab contains room controls; Lights keeps light-only popups with the names and count of lights currently on. Curtains, media and cameras have grouped layouts, and Climate history and activity stay together at the bottom.

Under **Edit dashboard → Theme colour**, select Ocean Blue, Emerald, Amethyst, Rosewood or Graphite, then **Save**. Active lights retain their yellow status. Activity glows, gently animated icons and hover effects respond to entity states and respect reduced-motion preferences.

## What stays the same

The original 15 views and their card designs: Home, Lights, Curtains, Climate, Energy, Music Assistant, Media, Security, Pool & garden, Weather, Activity, Device directory, All cameras, Security sensors and the popup library. Some auxiliary views are subviews and are reached through cards rather than the top navigation.

## What is easier

- Configure the dashboard using Home Assistant’s **Edit dashboard** screen.
- Choose an area or individual lights and switches for each lighting room.
- Rename lighting rooms, exclude entities, or click **+ Add room**.
- Room summaries, popup tiles and bulk controls are generated from the same room list.
- Select climate, cover, media, security, weather and energy entities in grouped pickers. A central binding updates that entity everywhere in the original design.
- Change the dashboard URL without rewriting navigation links.

The shared JavaScript contains neutral entity placeholders, not a household’s working entity IDs. Unselected entities show setup hints. Some summaries remain empty until their entities are configured.

## Easy installation

[![Install DwellDeck in HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=rawad-haidar&repository=DwellDeck&category=plugin)

1. **Install:** click the button above, open your Home Assistant, add the repository if prompted and download DwellDeck. Refresh the browser.
2. **Create:** go to **Settings → Dashboards → Add dashboard → DwellDeck · Original design**.
3. **Configure:** the setup screen shows which dependencies are missing, with an **Install in HACS** link for each. Install those items, refresh, then choose your rooms and entities and save.

**No theme file, no configuration.yaml changes and no YAML dashboard paste on the normal install path.** Colors are included, and the dashboard URL is detected automatically. Advanced overrides remain available.

Home Assistant/HACS must already be available. This is a guided installation: HACS handles downloads, and users approve installation and configure Browser Mod. It does not silently install integrations or change server settings.

If the HACS button cannot open your instance, add `https://github.com/rawad-haidar/DwellDeck` as a custom repository with category **Dashboard** (Plugin in some versions), then download it. See [the short install guide](INSTALL.md) for troubleshooting.

### Required dependencies

These preserve the original dashboard’s custom-card design. The setup screen checks for them and includes these direct install links:

| Component | Install |
| --- | --- |
| Button Card | [Open in HACS](https://my.home-assistant.io/redirect/hacs_repository/?owner=custom-cards&repository=button-card&category=plugin) |
| card-mod | [Open in HACS](https://my.home-assistant.io/redirect/hacs_repository/?owner=thomasloven&repository=lovelace-card-mod&category=plugin) |
| Mini Graph Card | [Open in HACS](https://my.home-assistant.io/redirect/hacs_repository/?owner=kalkih&repository=mini-graph-card&category=plugin) |
| Browser Mod | [Open in HACS](https://my.home-assistant.io/redirect/hacs_repository/?owner=thomasloven&repository=hass-browser_mod&category=integration) |

After installing Browser Mod, follow its instructions to add its integration in **Devices & services**. Its popup service must be available. A restart may be required by that integration. History charts also require retained Recorder data.

Music Assistant and [Add-on Iframe Card](https://github.com/azuwis/ha-addon-iframe-card) are optional. The Music Assistant page shows setup instructions until you configure its app path.

### Optional theme override

The built-in colors use card-mod and do not require a separately installed theme. Existing users who already selected **Villa Midnight** can keep that setting. For a whole-interface theme, the optional `themes/dwelldeck-midnight.yaml` file is still included; use Home Assistant’s normal theme installation instructions and enter its theme name in the advanced field.

### Manual fallback

Copy `dwelldeck.js` to Home Assistant’s `www` folder, register `/local/dwelldeck.js?v=0.8.1` as a JavaScript module in dashboard Resources, and refresh. Then create the community dashboard as above. If the picker is unavailable, create a blank dashboard and paste `examples/dashboard.yaml` into its raw configuration editor.

HACS registers its own resource URL. Do not manually add a second URL with different capitalization; use the directory HACS actually installed.

## Configure rooms

Open **DwellDeck → Edit dashboard → Lighting rooms**. Expand a room, then select:

- **Room title**: optional replacement name.
- **Discover lights and switches from area**: automatically include those domains from a Home Assistant area.
- **Lights and switches**: explicitly selected entities, combined with the area selection.
- **Excluded entities**: remove specific devices from the room.

Click **+ Add room** for another lighting room in the same original card/popup style. Save to regenerate the dashboard. Area assignments follow the entity’s area first, then its device’s area.

For the other original cards, expand the matching entity domain and choose replacements. These selectors map the original design’s roles; they do not create areas, devices, entities or automations. Use Home Assistant Settings to manage those.

## Strategy configuration

```yaml
strategy:
  type: custom:dwelldeck-original
  title: DwellDeck
```

The visual editor writes `rooms`, `extra_rooms` and `entities` for you. All configuration is saved with the Home Assistant dashboard; no settings are stored in the browser. Do not share your configured dashboard export without removing private entity IDs and room names.

For Music Assistant, enter the app’s path from your Home Assistant sidebar URL in **Music Assistant app path**. Leave it empty for an instruction card. Do not put credentials or access tokens in this field.

## Editing behavior

This is a generated dashboard. **Edit dashboard** opens the central setup editor rather than individual card layout editors. Saving regenerates the original layout. Custom per-card layout changes require editing the template source; this is intentional so bindings stay consistent across cards and popups.

Some original summaries discover additional entities from Home Assistant state domains. Device names in generated controls come from Home Assistant. The original household-specific bedroom labels have generic defaults in the public package.

## Verification and status

Version 0.8.1 includes live Home Assistant layout and editor checks. Automated tests cover the 15-view structure, central replacement, popup synchronization, area discovery, source immutability, navigation validation and strategy registration. A private round-trip comparison verifies that binding the source household’s entities reproduces every original card, template, style and action, apart from the requested dashboard title and URL prefix.

The restored Home page and central editor have been checked in Home Assistant. No device actions were invoked during validation. Full climate/media/camera control behavior and a fresh HACS installation remain to be tested before calling this a stable release.

## Development

Node.js 22 or newer; no npm dependencies.

```sh
npm run build
npm run check
npm test
```

Edit the sources in `src/`, never `dwelldeck.js` directly. `npm run build` bundles them into the single `dwelldeck.js` file HACS serves.

| Path | Contents |
| --- | --- |
| `src/data/*.json` | Sanitized layout template, entity slots, room templates, labels and built-in theme |
| `src/util.mjs` | Cloning, tree walking and entity-ID list rewriting |
| `src/dependencies.mjs` | Required custom cards and integrations, and their install status |
| `src/discovery.mjs` | Area, device and entity discovery from Home Assistant registries |
| `src/cards.mjs` | Room tiles, light popups, area room cards and entity sections |
| `src/views.mjs` | Rooms, lights, curtains, media, camera and climate view organisation |
| `src/theme.mjs` | Built-in colours, palettes and activity effects |
| `src/generator.mjs` | `generateOriginal`, which applies bindings to the template |
| `src/editor.mjs`, `src/strategy.mjs` | The Edit dashboard editor and the dashboard strategy |
| `src/index.mjs` | Public API; only these names stay exported from the bundle |

Golden tests in `tests/golden.test.mjs` hash the generated dashboard for many configurations. If you change output on purpose, review the change and regenerate them with `UPDATE_GOLDEN=1 npm test`. GitHub Actions checks syntax, runs the tests and fails if `dwelldeck.js` is out of date with `src/`.

## Publish and update

Upload this folder’s contents to the repository root. Keep `dwelldeck.js`, `hacs.json`, `README.md` and `LICENSE` at the root. Publish `v0.8.1` as a pre-release and attach the JavaScript file. Include the theme folder in the repository. See `GITHUB_SETUP.md`.

Do not upload private dashboard backups, source household entity bindings, Home Assistant configuration files or unredacted screenshots. The supplied package has been checked separately for those files.

For manual updates, replace the JavaScript, update its resource URL version, and refresh. Keep a backup of your strategy settings. The 0.1 room-grid card is not used by this edition; replace its dashboard configuration with the strategy example.

MIT licensed. See `LICENSE`.
