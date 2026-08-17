/**
 * Browser half of @dsh-external/dsh-web-search-anysearch.
 *
 * Registers an independent settings **section** ("Web Search (AnySearch)") into
 * the settings sidebar via the shell-declared `settings.section` slot. This is
 * the officially documented third-party extension point (declared earlier in
 * the boot tree than the `settings.plugin.item` list, so it has no
 * registration-order race). Every field is persisted through the **credentials
 * domain** (`credentials.set` / `credentials.unset` / `credentials.describe`)
 * under dedicated `ANYSEARCH_*` references, so:
 *
 * - the API key is stored by the DSH credentials service (never in settings files),
 * - the section works even though `web-search-anysearch` is outside the core's
 *   hard-coded `WEB_SETTINGS_NAMESPACES` allowlist (`settings-not-exposed`),
 * - no Harness core source is modified.
 *
 * The host provider re-resolves these references on every search, so saving
 * here applies immediately.
 */
// Only React is a runtime import; cordis/slots services arrive via ctx.
import { useState } from 'react'

const SECTION_ID = 'anysearch-web-search'
const NS = 'settings.plugins.anysearch'

/** Credential references the host provider reads with highest precedence. */
const REFS = {
  apiKey: 'ANYSEARCH_API_KEY',
  baseURL: 'ANYSEARCH_BASE_URL',
  maxResults: 'ANYSEARCH_MAX_RESULTS',
  zone: 'ANYSEARCH_ZONE',
  language: 'ANYSEARCH_LANGUAGE',
  format: 'ANYSEARCH_FORMAT',
} as const

type FieldKey = Exclude<keyof typeof REFS, 'apiKey'>
const FIELD_KEYS: readonly FieldKey[] = ['baseURL', 'maxResults', 'zone', 'language', 'format']

/** English copy. */
const en = {
  title: 'Web Search (AnySearch)',
  description: 'The AnySearch search provider. All values are stored by the DSH credentials service; blank fields keep the current value.',
  apiKey: 'API key',
  apiKeyHint: 'Stored by the DSH credentials service. Leave blank to keep the current key.',
  apiKeySet: 'A key is configured.',
  apiKeyUnset: 'No key is configured; search is unavailable until one is.',
  baseURL: 'Base URL',
  baseURLHint: 'Leave blank for https://api.anysearch.com',
  maxResults: 'Max results',
  maxResultsHint: '1–20, default 10.',
  zone: 'Zone',
  zoneHint: 'cn or intl.',
  language: 'Language',
  languageHint: 'e.g. zh-CN, en.',
  format: 'Format',
  formatHint: 'json or markdown (default json).',
  save: 'Save',
  saving: 'Saving…',
  saved: 'Saved. Values apply to the next search.',
  saveFailed: 'The deployment did not accept these values.',
  reset: 'Reset',
  resetHint: 'Remove stored values and fall back to defaults.',
  resetDone: 'Stored values removed.',
  placeholderKey: 'sk-…',
}

/** Simplified Chinese copy. */
const zh: typeof en = {
  title: '网页搜索（AnySearch）',
  description: 'AnySearch 搜索提供方。所有值均由 DSH credentials service 保存；留空的字段保持当前值。',
  apiKey: 'API Key',
  apiKeyHint: '由 DSH credentials service 保存。留空表示保持当前密钥。',
  apiKeySet: '已配置密钥。',
  apiKeyUnset: '未配置密钥；配置之前搜索不可用。',
  baseURL: '接口地址',
  baseURLHint: '留空使用 https://api.anysearch.com',
  maxResults: '最大结果数',
  maxResultsHint: '1–20，默认 10。',
  zone: '区域',
  zoneHint: 'cn 或 intl。',
  language: '语言',
  languageHint: '例如 zh-CN、en。',
  format: '格式',
  formatHint: 'json 或 markdown（默认 json）。',
  save: '保存',
  saving: '保存中…',
  saved: '已保存，下次搜索生效。',
  saveFailed: '本部署没有接受这些值。',
  reset: '重置',
  resetHint: '删除已保存的值并回退到默认值。',
  resetDone: '已删除已保存的值。',
  placeholderKey: 'sk-…',
}

interface Snapshot {
  apiKeyConfigured: boolean
  writable: boolean
  saving: boolean
  message: string
}

const IDLE: Snapshot = { apiKeyConfigured: false, writable: true, saving: false, message: '' }

/**
 * Register the AnySearch card with the Plugins configuration tab.
 * @param ctx - the browser plugin context (services: slots, locale, connection, remote).
 */
function apply(ctx: any): void {
  const { api } = ctx.get('connection')
  const t = ctx.locale.bind(NS)
  let snapshot: Snapshot = { ...IDLE }
  const listeners = new Set<() => void>()
  const notify = () => {
    for (const listener of listeners) listener()
  }
  const setSnapshot = (next: Snapshot) => {
    snapshot = next
    notify()
  }

  /** Ask the credentials domain about the API-key reference state. */
  const refreshCredential = async (): Promise<void> => {
    let response: any
    try {
      response = await api.credentials.describe({ refs: [REFS.apiKey] })
    } catch {
      return
    }
    if (!response.result.ok) return
    const view = response.result.value.credentials[REFS.apiKey]
    setSnapshot({
      ...snapshot,
      apiKeyConfigured: view?.configured === true,
      writable: view?.writable !== false,
    })
  }

  /** Write non-blank fields through the credentials domain. */
  const save = async (fields: Record<FieldKey, string>, apiKey: string): Promise<void> => {
    setSnapshot({ ...snapshot, saving: true, message: '' })
    try {
      if (apiKey.trim().length > 0) {
        const response = await api.credentials.set({ ref: REFS.apiKey, value: apiKey.trim() })
        if (!response.result.ok) throw new Error(response.result.error?.message ?? 'credentials.set failed')
      }
      for (const key of FIELD_KEYS) {
        const value = fields[key].trim()
        if (value.length === 0) continue
        const response = await api.credentials.set({ ref: REFS[key], value })
        if (!response.result.ok) throw new Error(response.result.error?.message ?? 'credentials.set failed')
      }
      setSnapshot({ ...snapshot, saving: false, message: 'saved' })
    } catch (error) {
      setSnapshot({ ...snapshot, saving: false, message: 'saveFailed' })
    }
    await refreshCredential()
  }

  /** Remove every stored reference so defaults take over. */
  const reset = async (): Promise<void> => {
    setSnapshot({ ...snapshot, saving: true, message: '' })
    for (const ref of Object.values(REFS)) {
      try {
        await api.credentials.unset({ ref })
      } catch {
        // Best effort; a failure leaves the value in place.
      }
    }
    setSnapshot({ ...snapshot, saving: false, message: 'resetDone' })
    await refreshCredential()
  }

  const store = {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }

  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: SECTION_ID,
        order: 20,
        label: () => t('title'),
        locale: NS,
        children: { 'settings.anysearch.item': { kind: 'list', scope: 'root' } },
      },
      AnySearchSection,
    ),
  )

  ctx.slots.inject('settings.anysearch.item', () =>
    ctx.slots.register(
      {
        name: 'settings.anysearch.item',
        id: 'anysearch-config',
        order: 0,
        locale: NS,
        inject: () => ({
          hooks: { anySearchCard: store },
          save,
          reset,
        }),
      },
      AnySearchForm,
    ),
  )

  ctx.effect(
    () => ctx.locale.register(NS, { zh, en }),
    'ui-plugins-anysearch: card dictionaries',
  )

  ctx.effect(
    () =>
      ctx.remote.$on('credentials/updated', (ref: string) => {
        if (ref === REFS.apiKey) refreshCredential()
      }),
    'ui-plugins-anysearch: credential invalidations',
  )

  void refreshCredential()
}

/** Section container: renders the form item declared as its child. */
function AnySearchSection({ renderSlot }: any): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      {renderSlot('settings.anysearch.item')}
    </div>
  )
}

/** The form item: staged fields, credential badge, save/reset actions. */
function AnySearchForm(props: any): JSX.Element {
  const snapshot: Snapshot = props.useAnySearchCard((s: Snapshot) => s)
  const { save, reset } = props
  const [apiKey, setApiKey] = useState('')
  const [fields, setFields] = useState<Record<FieldKey, string>>({
    baseURL: '',
    maxResults: '',
    zone: '',
    language: '',
    format: '',
  })
  const t = (key: keyof typeof zh): string => zh[key]

  const setField = (key: FieldKey, value: string) => {
    setFields((previous) => ({ ...previous, [key]: value }))
  }

  const style = {
    row: { display: 'flex', flexDirection: 'column' as const, gap: 4, marginTop: 8 },
    label: { fontSize: 13, lineHeight: '20px', color: 'var(--dsw-alias-label-secondary, #64748b)' },
    hint: { fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary, #94a3b8)' },
    input: {
      height: 32,
      padding: '0 10px',
      fontSize: 14,
      borderRadius: 8,
      border: '1px solid var(--dsw-alias-border-l2, #cbd5e1)',
      background: 'var(--dsw-alias-field-fill, #fff)',
      color: 'var(--dsw-alias-label-primary, #0f172a)',
      font: 'inherit',
    },
    badge: {
      display: 'inlineBlock' as string,
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: 6,
      background: snapshot.apiKeyConfigured
        ? 'var(--dsw-alias-state-success-primary, #16a34a)'
        : 'var(--dsw-alias-state-error-primary, #dc2626)',
    },
    button: {
      height: 32,
      padding: '0 14px',
      marginTop: 10,
      marginRight: 8,
      borderRadius: 16,
      border: 'none',
      cursor: 'pointer',
      fontSize: 14,
      background: 'var(--dsw-alias-button-primary-fill, #2563eb)',
      color: 'var(--dsw-alias-label-primary-foreground, #fff)',
      font: 'inherit',
    },
    secondary: {
      background: 'transparent',
      border: '1px solid var(--dsw-alias-border-l2, #cbd5e1)',
      color: 'var(--dsw-alias-label-secondary, #64748b)',
    },
  }

  return (
    <div>
      <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 500 }}>{t('title')}</h3>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--dsw-alias-label-secondary, #64748b)' }}>{t('description')}</p>

      <div style={style.row}>
        <label style={style.label}>
          <span style={style.badge} />
          {t('apiKey')}
        </label>
        <input
          style={style.input}
          type="password"
          value={apiKey}
          disabled={!snapshot.writable}
          placeholder={t('placeholderKey')}
          onChange={(event) => setApiKey(event.target.value)}
        />
        <span style={style.hint}>
          {snapshot.apiKeyConfigured ? t('apiKeySet') : t('apiKeyUnset')} {t('apiKeyHint')}
        </span>
      </div>

      <div style={style.row}>
        <label style={style.label}>{t('baseURL')}</label>
        <input
          style={style.input}
          value={fields.baseURL}
          placeholder="https://api.anysearch.com"
          onChange={(event) => setField('baseURL', event.target.value)}
        />
        <span style={style.hint}>{t('baseURLHint')}</span>
      </div>

      <div style={style.row}>
        <label style={style.label}>{t('maxResults')}</label>
        <input
          style={style.input}
          type="number"
          min={1}
          max={20}
          value={fields.maxResults}
          placeholder="10"
          onChange={(event) => setField('maxResults', event.target.value)}
        />
        <span style={style.hint}>{t('maxResultsHint')}</span>
      </div>

      <div style={style.row}>
        <label style={style.label}>{t('zone')}</label>
        <select style={style.input} value={fields.zone} onChange={(event) => setField('zone', event.target.value)}>
          <option value="">{'(default)'}</option>
          <option value="cn">cn</option>
          <option value="intl">intl</option>
        </select>
        <span style={style.hint}>{t('zoneHint')}</span>
      </div>

      <div style={style.row}>
        <label style={style.label}>{t('language')}</label>
        <input
          style={style.input}
          value={fields.language}
          placeholder="zh-CN"
          onChange={(event) => setField('language', event.target.value)}
        />
        <span style={style.hint}>{t('languageHint')}</span>
      </div>

      <div style={style.row}>
        <label style={style.label}>{t('format')}</label>
        <select style={style.input} value={fields.format} onChange={(event) => setField('format', event.target.value)}>
          <option value="">{'(default)'}</option>
          <option value="json">json</option>
          <option value="markdown">markdown</option>
        </select>
        <span style={style.hint}>{t('formatHint')}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center' }}>
        <button
          style={style.button}
          disabled={snapshot.saving || !snapshot.writable}
          onClick={() => void save(fields, apiKey)}
        >
          {snapshot.saving ? t('saving') : t('save')}
        </button>
        <button
          style={{ ...style.button, ...style.secondary }}
          disabled={snapshot.saving || !snapshot.writable}
          onClick={() => void reset()}
          title={t('resetHint')}
        >
          {t('reset')}
        </button>
        {snapshot.message.length > 0 ? <span style={style.hint}>{t(snapshot.message as keyof typeof zh)}</span> : null}
      </div>
    </div>
  )
}

/**
 * Cordis service injection for the browser-half plugin. These are service
 * names (not package names) — the shell resolves them against the client
 * module table before `apply` runs. Without this export, `ctx.slots` (and
 * every other service below) is undefined in `apply`, and cordis fails the
 * fiber with "Cannot get property \"slots\" without inject".
 */
const inject = ['slots', 'locale', 'connection', 'remote']

export { apply, inject }
