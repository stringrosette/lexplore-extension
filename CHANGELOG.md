# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/username/lexplore-extension/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/username/lexplore-extension/releases/tag/v0.1.0
