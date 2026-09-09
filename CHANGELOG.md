# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.2] - 2026-09-08

Compatibility fixes for harness API changes.

### Changed

- Migrated settings registration from the removed `installSettingsSection` / `settingsNamespace` helpers to the current `ctx.settings.installSection` + a plain string namespace, matching the shipped `web-search-deepseek` provider. The package now loads on harness versions that removed the old helpers.
- Migrated the browser half's credential writes to `ctx.remote.credentials` with positional arguments (`set(ref, value)` / `describe([ref])` / `unset(ref)`), matching the shipped web-search controller, so saving the API key and options is accepted by the current harness.
- Updated credential invalidation handling to the current `credentials/reference-updated` event, made reset failures visible, and aligned Harness peer requirements with the `0.1.2-rc.1` API line.

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
