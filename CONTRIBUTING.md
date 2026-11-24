# Contributing

Use Node.js 22 or newer. Edit the modules in `src/` (see the Development section of the README), then run `npm run build`, `npm run check` and `npm test`, and commit the rebuilt `dwelldeck.js` with your change. No dependencies are required. Top-level names must be unique across `src/` modules because the build bundles them into one scope. If a change alters the generated dashboard on purpose, regenerate the golden hashes with `UPDATE_GOLDEN=1 npm test` and explain the change in your pull request.

Test changes in Home Assistant, especially the generated Home view, navigation, setup editor and popups. Do not include private entity bindings, credentials, server addresses or unredacted screenshots in issues or pull requests.

Bug reports should include Home Assistant and browser versions, DwellDeck version, steps to reproduce and a minimal redacted strategy configuration.
