# Lexplore Extension

**Version:** 0.1.0
**Last Updated:** 2026-05-10

Browser extension (Manifest V3) that extracts YouTube transcripts and sends them to the Lexplore API as texts.

## How it works

1. Open a YouTube video with captions
2. Click the Lexplore toolbar icon
3. Preview the transcript and confirm the title
4. Click **Send to Lexplore** — the transcript is POSTed directly to the backend

## Installation (development)

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select this folder

## Configuration

Click the ⚙ icon in the popup (or go to the extension's Options page) and set:

| Field | Description | Default |
|-------|-------------|---------|
| API URL | Base URL of the Lexplore backend | `http://localhost:8000` |
| Bearer Token | JWT token from your Lexplore account | _(empty)_ |

To get your token, log in to the Lexplore app, open DevTools → Application → Local Storage and copy the stored JWT.

## Project structure

```
lexplore-extension/
├── manifest.json          # MV3 manifest
├── content/
│   └── content.js         # Runs on YouTube, extracts transcript
├── background/
│   └── service-worker.js  # Handles API calls and storage
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js           # Popup UI logic
└── settings/
    ├── settings.html
    ├── settings.css
    └── settings.js        # Settings page
```

## Development

```bash
npm install        # installs web-ext for linting
npm run lint       # validate manifest and extension files
```

To reload the extension after changes, click the refresh icon on `chrome://extensions`.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
