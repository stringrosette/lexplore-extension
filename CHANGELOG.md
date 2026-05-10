# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.0] - 2026-05-10

### Added
- Inline login state in popup: person icon in header opens a sign-in form (email + password) using the same `POST /api/v1/auth/login` endpoint as lexplore-app
- Account button turns indigo when logged in; shows signed-in email and Sign out button on repeat clicks
- Token and email stored automatically in `chrome.storage.local` on successful login

### Removed
- Settings gear icon removed from popup header (settings remain accessible via the extension options page)

## [0.5.0] - 2026-05-10

### Added
- Transcript content now includes timestamps: each segment formatted as `[M:SS] text` on its own line

### Fixed
- `sendToLexplore` was sending `source_url` instead of `url` (API field name mismatch)
- `language` and `text_type: 'script'` now passed to the API

### Changed
- Preview shows first 8 timestamped lines instead of a raw 400-character slice

## [0.4.0] - 2026-05-10

### Added
- `webRequest` listener in service worker intercepts YouTube's timedtext API requests and stores the URL (with auth tokens) per tab in `chrome.storage.session`

### Changed
- Transcript loading now replays the captured timedtext URL via `executeScript` fetch in the YouTube tab — no DOM click simulation
- Service worker reduced to a single `webRequest.onBeforeRequest` listener; all dead message handlers removed
- `parseTranscript()` tries JSON3 format first, falls back to XML

### Removed
- `loadTranscriptFromDOM()` and all DOM click simulation logic removed

## [0.3.1] - 2026-05-10

### Fixed
- Overflow button selector narrowed to video info area only — previous broad selector could trigger like/dislike buttons
- Added detailed `[lexplore]` console logging inside DOM extraction: segment counts, panel visibility, each candidate selector result, dropdown items, poll attempts

## [0.3.0] - 2026-05-10

### Added
- Channel name and active caption language badge displayed in popup

### Changed
- Transcript extraction now reads from YouTube's DOM transcript panel (`ytd-transcript-segment-renderer`) instead of fetching the timedtext HTTP API — eliminates all cookie/origin/format issues
- Active caption language auto-detected from `player.getOption('captions', 'track')` — no dropdown needed, user controls language in YouTube UI
- Language dropdown removed from popup; popup now shows video metadata (title, channel, language) then a single Load button

### Removed
- `getLanguages()`, `fetchTranscript()`, `parseTranscriptJson3()`, `parseTranscriptXml()` functions removed

## [0.2.0] - 2026-05-10

### Added
- Language selection step in popup: lists all available transcript languages before loading

### Changed
- Transcript extraction now uses `chrome.scripting.executeScript` (world: MAIN) to read `ytInitialPlayerResponse` directly — replaces fragile regex fetch of page HTML
- All logic (extraction, transcript fetch, API call) runs directly in popup page, bypassing service worker message passing which caused undefined responses due to MV3 sleep/wake race condition
- Settings page accesses `chrome.storage.local` directly (no service worker relay)
- XML parsing uses regex (DOMParser unavailable in service workers)
- Content script removed

## [0.1.0] - 2026-05-10

### Added
- Initial project scaffold (Manifest V3, vanilla JS)
- Content script for YouTube transcript extraction
- Popup UI for previewing and sending transcripts
- Background service worker for API communication and auth
- Settings page for API URL and token configuration

[Unreleased]: https://github.com/stringrosette/lexplore-extension/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/stringrosette/lexplore-extension/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/stringrosette/lexplore-extension/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/stringrosette/lexplore-extension/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/stringrosette/lexplore-extension/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/stringrosette/lexplore-extension/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/stringrosette/lexplore-extension/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/stringrosette/lexplore-extension/releases/tag/v0.1.0
