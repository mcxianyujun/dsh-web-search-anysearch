# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.1] - 2026-08-17

Packaging fixes for npm publication readiness.

### Changed

- Changed the npm package name from `@dsh-external/dsh-web-search-anysearch` to `dsh-web-search-anysearch`.
- Tightened DSH peer dependency ranges to the `0.1.0-rc.6` working train.
- Updated installer/uninstaller scripts and the client bundle identity to the new package name.

## [0.1.0]

Initial public release.

### Added

- Native DeepSeek Harness `WebSearchProvider` (`id: anysearch`) for AnySearch.
- AnySearch `POST /v1/search` REST integration with Bearer authentication.
- Web profile support, including a dedicated settings section under
  Settings → 网页搜索（AnySearch）with API Key / Base URL / Max Results / Zone / Language / Format.
- Headless profile support.
- Independent credentials (`ANYSEARCH_API_KEY` and per-field `ANYSEARCH_*` references) stored via
  the DSH credentials service.
- Source metadata preservation (URL / title / snippet) with URL deduplication.
- Configurable search options: `max_results`, `zone`, `language`, `format`, `baseURL`.
- Structured, non-fabricated error handling for 401/403, 429, network, JSON, and abnormal envelopes.
- Idempotent Windows installer and uninstaller scripts (`scripts/install.ps1`,
  `scripts/uninstall.ps1`) with backup and dry-run support.
- Zero-network unit tests (`node --test`).
- English and Simplified Chinese documentation.
