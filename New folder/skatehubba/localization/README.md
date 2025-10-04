# Localization (i18n)

This folder contains language files and localization logic for SkateHubba.

## Overview
- Translate all app screens, buttons, and messages into multiple languages.
- Store language files as simple JSON (e.g. `en.json`, `es.json`).
- Detect device language or let user pick their preferred language.
- Community can contribute translations for new languages.
- Use with [i18n-js](https://github.com/fnando/i18n-js) or [react-i18next](https://react.i18next.com/).

## Getting Started
- Add new language files in this folder.
- Use the localization service in `/services/localization.js`.
- Access translations in components with `i18n.t('key')`.
