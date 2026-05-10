# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Language selection step in popup: lists all available transcript languages before loading

### Changed
- Transcript extraction now uses `chrome.scripting.executeScript` (world: MAIN) to read `ytInitialPlayerResponse` directly — replaces fragile regex fetch of page HTML
- XML parsing moved to service worker using regex (DOMParser unavailable there)
- Content script removed; all extraction handled by background service worker

## [0.1.0] - 2026-05-10

### Added
- Initial project scaffold (Manifest V3, vanilla JS)
- Content script for YouTube transcript extraction
- Popup UI for previewing and sending transcripts
- Background service worker for API communication and auth
- Settings page for API URL and token configuration

[Unreleased]: https://github.com/username/lexplore-extension/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/username/lexplore-extension/releases/tag/v0.1.0
