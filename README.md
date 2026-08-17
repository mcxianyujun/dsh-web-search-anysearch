# dsh-web-search-anysearch

[English](README.md) | [简体中文](README.zh-CN.md)

**AnySearch Web Search Provider for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).**

A native `WebSearchProvider` plugin that connects the harness `ctx.web` seam to the AnySearch
[`POST /v1/search`](https://anysearch.com) REST API. It ships a **dedicated Web settings section** for
configuration, stores the API key through the **DSH credentials service**, and supports both the
**Web** and **Headless** profiles.

This is a native provider — not an MCP server, not a Skill, and not a fork or patch of DeepSeek
Harness. No Harness core source is modified.

## Quick start

Two install paths are available — the **DSH CLI (npm)** route and the **Windows PowerShell
installer** (see [Installation](#installation)). The Windows installer flow is:

1. **Install** (Windows):

   ```powershell
   cd dsh-web-search-anysearch
   pnpm install        # installs dev dependencies (tsdown, react) and their peers
   pnpm build          # produces lib/index.mjs + lib/client.js
   .\scripts\install.ps1 -Web     # or -Headless, or -Both (default)
   ```

2. **Restart** DeepSeek Harness (`searchProvider` is read when the web seam is constructed).

3. Open **Settings → 网页搜索（AnySearch）** and enter your AnySearch API key. It is stored by the
   DSH credentials service, never in a settings file.

4. Ask the agent something that requires web search — the harness `web_search` tool now uses AnySearch.

## Features

- Native DeepSeek Harness `WebSearchProvider` (`id: anysearch`) over `ctx.web`
- AnySearch native `POST /v1/search` REST API (not the MCP `/mcp` JSON-RPC bridge)
- Dedicated **Web settings section** (independent of the DeepSeek search provider)
- Independent credentials — `ANYSEARCH_API_KEY` and per-field `ANYSEARCH_*` references, never
  reusing the DeepSeek provider's key
- API key stored by the DSH credentials service, never written to settings documents
- Source preservation — `url` / `title` / `snippet` are mapped intact and deduplicated by URL
- Configurable **Max Results** (1–20), **Zone** (`cn`/`intl`), **Language**, **Format**
  (`json`/`markdown`), and **Base URL**
- Web profile support (GUI + settings section)
- Headless profile support (CLI / automation)
- Structured, non-fabricated error handling (401/403, 429, network, JSON, abnormal envelopes)
- Minimal zero-network unit tests
- No Harness core patch required

## Requirements

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) with a `web` and/or
  `headless` profile. **Tested with the DeepSeek Harness desktop install (Node 24 / pnpm via
  corepack).**
- An [AnySearch](https://anysearch.com) API key (optional for low-rate anonymous use; recommended
  for reliable access).
- Node.js `>= 20` and `pnpm` for the build step (the Harness desktop bundle ships both).

## Installation

### Option 1 — Install from npm with the DSH CLI

Install the bundle for the Web profile:

```bash
dsh plugin --profile web add dsh-web-search-anysearch
```

For Headless:

```bash
dsh plugin --profile headless add dsh-web-search-anysearch
```

This installs and registers the AnySearch bundle, but does **not** automatically change the active
Web search provider. To enable AnySearch, add the following override to the target profile's
`cordis.patch.yml`:

```yaml
- id: web
  config:
    searchProvider: anysearch
```

Then restart DeepSeek Harness.

> If `dsh plugin add` cannot find `pnpm` on Windows, use the PowerShell installer below — it locates
> the Node/corepack environment bundled with DeepSeek Harness.

The package is published on npm as
[`dsh-web-search-anysearch`](https://www.npmjs.com/package/dsh-web-search-anysearch).

### Option 2 — Windows PowerShell installer

The installer modifies only the target profile's `package.json` (adds a `link:` dependency) and
`cordis.patch.yml` (registers the provider and selects it). It backs up both files first and is
idempotent — re-running it does not duplicate entries.

```powershell
.\scripts\install.ps1 -Web       # web profile only
.\scripts\install.ps1 -Headless  # headless profile only
.\scripts\install.ps1 -Both      # both profiles (default)
.\scripts\install.ps1 -Web -DryRun   # preview changes without writing
```

The installer also sets `searchProvider: anysearch` automatically, so no manual patch edit is needed.

### Manual installation

For troubleshooting or environments where the script is not used:

1. Add the plugin as a link dependency in `<DSH_HOME>/profiles/<profile>/package.json`:

   ```json
   "dependencies": {
     "dsh-web-search-anysearch": "link:/absolute/path/to/dsh-web-search-anysearch"
   }
   ```

2. Add to `<DSH_HOME>/profiles/<profile>/cordis.patch.yml`:

   ```yaml
   - insert:
       - id: web-search-anysearch
         name: 'dsh-web-search-anysearch'
   - id: web
     config:
       searchProvider: anysearch
   ```

3. Run `pnpm install` inside the profile directory, then restart the Harness.

The plugin's `@deepseek-ai/*` imports resolve from the **plugin directory's own `node_modules`**
(installed by `pnpm install` in the plugin directory), so no junction farms or manual symlinks are
required.

## Configuration

Configuration precedence (lowest → highest):

1. Hard-coded defaults (`https://api.anysearch.com`, `maxResults` 10, `format` json)
2. Launching environment (`ANYSEARCH_API_KEY`, `ANYSEARCH_BASE_URL`, …)
3. The `web-search-anysearch` section in `<DSH_HOME>/settings.yaml`
4. Credentials-service references written by the GUI (highest)

| Field | Default | Notes |
|---|---|---|
| API key | — | Stored by the DSH credentials service under `ANYSEARCH_API_KEY`; leave blank to keep the current key |
| Base URL | `https://api.anysearch.com` | `ANYSEARCH_BASE_URL` |
| Max results | 10 | 1–20; `ANYSEARCH_MAX_RESULTS` |
| Zone | — | `cn` or `intl`; `ANYSEARCH_ZONE` |
| Language | — | e.g. `zh-CN`, `en`; `ANYSEARCH_LANGUAGE` |
| Format | `json` | `json` or `markdown`; `ANYSEARCH_FORMAT` |

The GUI stores these values through the credentials domain. Because the credentials service never
returns stored values to the client (by design), the GUI shows a configured/unset badge for the API
key and does not echo saved field values back — saved values still take effect on the next search.

## Usage

Ask the agent something that requires current information:

- "今天北京天气如何？" (today's weather in Beijing)
- "What are the latest release notes for Go?"
- "Search for recent DeepSeek Harness plugins"

The harness `web_search` tool returns results with preserved `url` / `title` / `snippet` metadata
that the agent cites as markdown links.

## How it works

```
DeepSeek Harness
      │  web_search
      ▼
dsh-web-search-anysearch  (WebSearchProvider, id: anysearch)
      │  POST /v1/search  (Authorization: Bearer <ANYSEARCH_API_KEY>)
      ▼
AnySearch /v1/search
      │  { code, message, data: { results: [{ title, url, snippet, content }] } }
      ▼
Search results + source metadata (url / title / snippet)
```

This is a native Harness `WebSearchProvider`, not an MCP server and not a Skill.

## Web vs Headless

- **Web profile**: the browser Harness — GUI, settings section, interactive agent conversations.
- **Headless profile**: CLI / automation — `dsh --profile headless "your task"`.

Both are tested end to end.

## Uninstall

### npm / DSH CLI

```bash
dsh plugin --profile web remove dsh-web-search-anysearch    # or --profile headless
```

This removes the npm dependency and the bundle registration. If you manually added the
`searchProvider: anysearch` override to the profile's `cordis.patch.yml`, remove that override too —
the DSH CLI `remove` command does not delete user-authored patch entries.

### Windows PowerShell uninstaller

```powershell
.\scripts\uninstall.ps1 -Web     # or -Headless / -Both
```

Uninstall removes the AnySearch provider override and restores the previously effective search
provider. If no previous provider override exists, DeepSeek Harness falls back to its bundle
default. Other provider configuration and unrelated profile patches are preserved. It does not
remove other plugins, the profile, `node_modules`, or your credentials.

How this works: a pre-existing `searchProvider` override stays in `cordis.patch.yml` the whole time.
Installing AnySearch appends a later `searchProvider: anysearch` override that temporarily shadows
it, and uninstalling deletes that AnySearch override so the earlier configuration takes effect
again. No separate "previous provider" state file is written.

Manual uninstall: remove the `dsh-web-search-anysearch` dependency from the profile
`package.json`, and remove the AnySearch insert entry and the `searchProvider: anysearch` override
from `cordis.patch.yml` (leaving any earlier `searchProvider` override in place), then run
`pnpm install` in the profile directory and restart.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Authentication Fails` / HTTP 401 | The API key is invalid or the wrong credential ref is configured. Re-enter the key in the settings section. |
| HTTP 429 | AnySearch rate limit. Reduce frequency or configure an API key. |
| `web_search` still uses another provider | `searchProvider` is still not `anysearch` in the profile patch, or the Harness was not restarted after install. |
| GUI section missing | The client bundle was rebuilt after the Harness started. Restart the Harness. |
| `ERR_MODULE_NOT_FOUND: @deepseek-ai/...` | The plugin's own `node_modules` is missing — run `pnpm install` inside the plugin directory. |
| `Cannot get property "slots" without inject` | A client bundle built without the `inject` export; rebuild with `pnpm build`. |
| `slot ... is not declared` | A registration raced a slot declaration; use the `settings.section` slot as this plugin does. |
| `pnpm` not found | Use the Harness-bundled corepack (the installer does this automatically) or put pnpm on `PATH`. |

## Security

- The API key is stored by the DSH credentials service, never in settings files or source code.
- The plugin never logs the full API key or the full `Authorization` header.
- Do not commit `.env` or credentials documents.
- Debug/session logs may contain sensitive data — review them before sharing.
- Real credentials must never appear in tests or fixtures; tests use mock values.

## Development

```bash
pnpm install   # dev dependencies
pnpm build     # tsdown: lib/index.mjs (node half) + lib/client.js (browser section)
pnpm test      # zero-network unit tests (node --test)
```

`lib/` is generated from `src/` and is not committed (see `.gitignore`). Development was assisted by
AI coding agents, with manual testing and validation on DeepSeek Harness.

## License

[MIT](LICENSE). The DeepSeek Harness core and its official packages are MIT licensed, so this plugin
is compatible with redistribution alongside the Harness.

## Acknowledgements

The DeepSeek Harness `ctx.web` seam and `WebSearchProvider` contract, the official
`dsh-web-search-*` providers, and the community AnySearch providers informed this plugin's design.
