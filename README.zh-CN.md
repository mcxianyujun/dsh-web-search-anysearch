# dsh-web-search-anysearch

[English](README.md) | [简体中文](README.zh-CN.md)

**面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 AnySearch 网页搜索 Provider。**

一个原生的 `WebSearchProvider` 插件，把 Harness 的 `ctx.web` seam 连接到 AnySearch 的
[`POST /v1/search`](https://anysearch.com) REST 接口。它带有一个**独立的 Web 设置页面**，API Key
通过 **DSH credentials service** 保存，同时支持 **Web** 与 **Headless** 两种 profile。

这是 Harness 原生 Provider——不是 MCP server，不是 Skill，也不是 DeepSeek Harness 的 fork 或补丁。
不修改任何 Harness 核心源码。

## 快速开始

1. **安装**（Windows）：

   ```powershell
   cd dsh-web-search-anysearch
   pnpm install        # 安装 dev 依赖（tsdown、react）及其 peer
   pnpm build          # 生成 lib/index.mjs + lib/client.js
   .\scripts\install.ps1 -Web     # 或 -Headless、-Both（默认）
   ```

2. **重启** DeepSeek Harness（`searchProvider` 在 web seam 构造时读取）。

3. 打开 **设置 → 网页搜索（AnySearch）**，填入你的 AnySearch API Key。它由 DSH credentials
   service 保存，不会写入设置文件。

4. 让 Agent 做一次需要联网搜索的任务——Harness 的 `web_search` 工具现在走 AnySearch。

## 特性

- 原生 DeepSeek Harness `WebSearchProvider`（`id: anysearch`），注册进 `ctx.web`
- 使用 AnySearch 原生 `POST /v1/search` REST 接口（不是 MCP `/mcp` JSON-RPC 桥接）
- **独立的 Web 设置页面**（与 DeepSeek 搜索 Provider 完全独立）
- 独立凭据——`ANYSEARCH_API_KEY` 及各字段 `ANYSEARCH_*` 引用，绝不复用 DeepSeek Provider 的 Key
- API Key 由 DSH credentials service 保存，绝不写入设置文档
- 来源保留——`url` / `title` / `snippet` 完整映射并按 URL 去重
- 可配置 **Max Results**（1–20）、**Zone**（`cn`/`intl`）、**Language**、**Format**
  （`json`/`markdown`）、**Base URL**
- Web profile 支持（GUI + 设置页面）
- Headless profile 支持（CLI / 自动化）
- 结构化、不造假的错误处理（401/403、429、网络、JSON、异常信封）
- 极小的零网络单元测试
- 无需修改 Harness 核心

## 环境要求

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)，带 `web` 和/或 `headless`
  profile。**已在 DeepSeek Harness 桌面版（Node 24 / 自带 corepack pnpm）实测。**
- 一个 [AnySearch](https://anysearch.com) API Key（低额度匿名使用可不配 Key；建议配置以保证稳定）。
- 构建需要 Node.js `>= 20` 与 `pnpm`（Harness 桌面版自带）。

## 安装

安装脚本只修改目标 profile 的 `package.json`（加一个 `link:` 依赖）和 `cordis.patch.yml`
（注册并选中 Provider）。它会先备份这两个文件，且幂等——重复运行不会产生重复条目。

```powershell
.\scripts\install.ps1 -Web       # 仅 web profile
.\scripts\install.ps1 -Headless  # 仅 headless profile
.\scripts\install.ps1 -Both      # 两个 profile（默认）
.\scripts\install.ps1 -Web -DryRun   # 只预览改动，不写入
```

### 手动安装

排查问题或不想用脚本时：

1. 在 `<DSH_HOME>/profiles/<profile>/package.json` 添加 link 依赖：

   ```json
   "dependencies": {
     "@dsh-external/dsh-web-search-anysearch": "link:/绝对路径/dsh-web-search-anysearch"
   }
   ```

2. 在 `<DSH_HOME>/profiles/<profile>/cordis.patch.yml` 添加：

   ```yaml
   - insert:
       - id: web-search-anysearch
         name: '@dsh-external/dsh-web-search-anysearch'
   - id: web
     config:
       searchProvider: anysearch
   ```

3. 在 profile 目录执行 `pnpm install`，然后重启 Harness。

插件的 `@deepseek-ai/*` 导入从**插件目录自身的 `node_modules`** 解析（在插件目录执行
`pnpm install` 装好），因此不需要 junction farm 或手工 symlink。

## 配置

配置优先级（低 → 高）：

1. 硬编码默认值（`https://api.anysearch.com`、`maxResults` 10、`format` json）
2. 启动环境变量（`ANYSEARCH_API_KEY`、`ANYSEARCH_BASE_URL`、…）
3. `<DSH_HOME>/settings.yaml` 中的 `web-search-anysearch` 段
4. GUI 写入的 credentials-service 引用（最高）

| 字段 | 默认值 | 说明 |
|---|---|---|
| API Key | — | 由 DSH credentials service 保存于 `ANYSEARCH_API_KEY`；留空保持当前 Key |
| Base URL | `https://api.anysearch.com` | `ANYSEARCH_BASE_URL` |
| Max Results | 10 | 1–20；`ANYSEARCH_MAX_RESULTS` |
| Zone | — | `cn` 或 `intl`；`ANYSEARCH_ZONE` |
| Language | — | 如 `zh-CN`、`en`；`ANYSEARCH_LANGUAGE` |
| Format | `json` | `json` 或 `markdown`；`ANYSEARCH_FORMAT` |

GUI 通过 credentials 域保存这些值。由于 credentials service 出于设计不会把已存值回传给前端，
GUI 对 API Key 显示"已配置/未配置"徽标、不回显已存字段值——但已存值会在下次搜索时生效。

## 使用

让 Agent 做需要实时信息的事：

- "今天北京天气如何？"
- "Go 最新版本的 release notes 是什么？"
- "搜索最近的 DeepSeek Harness 插件"

Harness 的 `web_search` 会返回保留 `url` / `title` / `snippet` 的来源，Agent 会以 markdown 链接引用。

## 工作原理

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
搜索结果 + 来源元数据（url / title / snippet）
```

这是 Harness 原生 `WebSearchProvider`，不是 MCP server，也不是 Skill。

## Web 与 Headless

- **Web profile**：浏览器 Harness——GUI、设置页面、交互式 Agent 对话。
- **Headless profile**：CLI / 自动化——`dsh --profile headless "任务"`。

两者均已端到端实测。

## 卸载

```powershell
.\scripts\uninstall.ps1 -Web     # 或 -Headless / -Both
```

卸载时只移除 AnySearch 自己添加的 Provider 覆盖，并恢复此前实际生效的搜索 Provider。如果安装前
没有自定义 Provider 覆盖，则 DeepSeek Harness 会自然回退到 bundle 默认 Provider。其他 Provider
配置及无关 profile patch 都会被完整保留。它不会删除其他插件、整个 profile、`node_modules` 或
你的 credentials。

实际原理：已有的 `searchProvider` 覆盖会一直保留在 `cordis.patch.yml` 里。安装 AnySearch 时只是
在末尾追加一条 `searchProvider: anysearch` 覆盖、暂时遮蔽原配置；卸载时删除这条 AnySearch 覆盖，
原配置即重新生效。installer 并不会单独保存一份「previousProvider」状态文件。

手动卸载：从 profile `package.json` 移除 `@dsh-external/dsh-web-search-anysearch` 依赖，从
`cordis.patch.yml` 删除 AnySearch 的 insert 条目与 `searchProvider: anysearch` 覆盖（保留之前
已有的任何 `searchProvider` 覆盖），然后在 profile 目录执行 `pnpm install` 并重启。

## 常见问题

| 症状 | 原因 / 解决 |
|---|---|
| `Authentication Fails` / HTTP 401 | API Key 无效或配置了错误的凭据引用。在设置页面重新填 Key。 |
| HTTP 429 | AnySearch 限流。降低频率或配置 API Key。 |
| `web_search` 仍用其他 Provider | profile patch 里 `searchProvider` 还不是 `anysearch`，或安装后未重启 Harness。 |
| 设置页面没有该 section | client bundle 在 Harness 启动后被重新构建。重启 Harness。 |
| `ERR_MODULE_NOT_FOUND: @deepseek-ai/...` | 插件目录缺 `node_modules`——在插件目录执行 `pnpm install`。 |
| `Cannot get property "slots" without inject` | client bundle 缺 `inject` 导出；`pnpm build` 重建。 |
| `slot ... is not declared` | 注册时序竞争；应使用 `settings.section` slot（本插件正是如此）。 |
| `pnpm` 找不到 | 使用 Harness 自带 corepack（安装脚本会自动处理）或把 pnpm 加入 `PATH`。 |

## 安全

- API Key 由 DSH credentials service 保存，绝不写入设置文件或源码。
- 插件绝不打印完整 API Key 或完整 `Authorization` 头。
- 不要提交 `.env` 或 credentials 文档。
- 调试/会话日志可能含敏感信息——分享前请检查。
- 测试与 fixture 中不得出现真实凭据；测试一律使用 mock 值。

## 开发

```bash
pnpm install   # dev 依赖
pnpm build     # tsdown：lib/index.mjs（node 半）+ lib/client.js（浏览器 section）
pnpm test      # 零网络单元测试（node --test）
```

`lib/` 由 `src/` 生成，不提交进 Git（见 `.gitignore`）。本项目开发过程中使用了 AI 编程 Agent
辅助，并在 DeepSeek Harness 中进行了人工测试与验证。

## 许可证

[MIT](LICENSE)。DeepSeek Harness 核心及其官方包同为 MIT 许可，本插件可随 Harness 一并分发。

## 致谢

DeepSeek Harness 的 `ctx.web` seam 与 `WebSearchProvider` 契约、官方 `dsh-web-search-*` 系列
Provider，以及社区 AnySearch Provider 项目为本插件设计提供了参考。
