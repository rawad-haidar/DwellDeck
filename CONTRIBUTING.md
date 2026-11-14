# Contributing

Use Node.js 22 or newer. Edit `original-layout-core.mjs`, run `npm run build`, `npm run check` and `npm test`. No dependencies are required. The distributable retains its embedded sanitized template header during rebuilds.

Test changes in Home Assistant, especially the generated Home view, navigation, setup editor and popups. Do not include private entity bindings, credentials, server addresses or unredacted screenshots in issues or pull requests.

Bug reports should include Home Assistant and browser versions, DwellDeck version, steps to reproduce and a minimal redacted strategy configuration.
