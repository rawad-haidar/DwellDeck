# Install DwellDeck

[![Install in HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=rawad-haidar&repository=DwellDeck&category=plugin)

1. Click **Install in HACS**, download DwellDeck, then refresh Home Assistant.
2. Open **Settings → Dashboards → Add dashboard → DwellDeck · Original design**.
3. Follow the **Installation checklist**, install missing dependencies, refresh, then pick rooms and entities and save.

The original Home page, tabs, styling and popups are included. No theme file or configuration.yaml edit is required. The dashboard URL is detected automatically.

## If something is missing

- **No HACS:** install/configure HACS first, or use the manual method in README.md.
- **No DwellDeck in Add dashboard:** refresh the browser, confirm HACS registered `dwelldeck.js` as a JavaScript module, and clear the frontend cache if necessary.
- **Browser Mod not detected:** installing its download is not enough; follow Browser Mod’s instructions to add its integration in Devices & services. Restart if its instructions require that.
- **Cards missing:** open Edit dashboard and check the dependency list. Install the missing card, then refresh. Detection describes the current browser session and may need a refresh after download.
- **Music Assistant page:** optional. Install Music Assistant and Add-on Iframe Card if you want it, then enter the app path in setup.
- **Room is empty:** select its Home Assistant area or add entities manually.
- **Navigation opens the wrong dashboard:** set the optional Dashboard URL path override to the dashboard’s actual URL prefix.
- **Already using a theme:** keep its name in the optional installed-theme field. Clear that field to use built-in colors.

Home Assistant asks users to approve installs. The setup checklist does not install integrations or change server settings automatically.
