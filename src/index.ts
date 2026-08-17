/**
 * @dsh-external/dsh-web-search-anysearch - an independent AnySearch-backed
 * WebSearchProvider for the DeepSeek Harness web capability seam (`ctx.web`).
 *
 * AnySearch is a plain search API: `POST {baseURL}/v1/search` with
 * `Authorization: Bearer <key>` and a JSON body `{query, max_results, format, ...}`.
 * It is deliberately NOT the Anthropic-compatible Messages API the shipped
 * `web-search-deepseek` provider speaks, so this provider never issues a model
 * call - one search is exactly one HTTP request.
 *
 * Provider id: `anysearch`. Settings namespace: `web-search-anysearch`.
 *
 * ## Configuration precedence (lowest -> highest)
 *
 * 1. Hard-coded defaults (base URL `https://api.anysearch.com`, `maxResults` 10, `format` json)
 * 2. Launching environment (`ANYSEARCH_API_KEY`, `ANYSEARCH_BASE_URL`, ...)
 * 3. The `web-search-anysearch` settings section (`~/.dsh/settings.yaml`)
 * 4. Credentials service references written by the GUI card
 *    (`ANYSEARCH_API_KEY`, `ANYSEARCH_BASE_URL`, `ANYSEARCH_MAX_RESULTS`,
 *    `ANYSEARCH_ZONE`, `ANYSEARCH_LANGUAGE`, `ANYSEARCH_FORMAT`) - the API key
 *    is always resolved through the credentials service when no literal
 *    `apiKey` is configured, so keys never land in settings documents.
 */
import z from '@deepseek-ai/schemastery';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings';
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment';
import { WebError } from '@deepseek-ai/dsh-web';
import {
  anySearchErrorDetail,
  clampMaxResults,
  mapAnySearchResponse,
} from './map.js';

//#region constants
/** Stable id this provider registers under. */
export const ANYSEARCH_PROVIDER_ID = 'anysearch';
/** Default endpoint root; `/v1/search` is appended. */
export const ANYSEARCH_DEFAULT_BASE_URL = 'https://api.anysearch.com';
/** Default credential ref holding the AnySearch API key. */
export const ANYSEARCH_DEFAULT_API_KEY_ENV = 'ANYSEARCH_API_KEY';
/** Credential-service references the GUI card writes (highest precedence). */
export const ANYSEARCH_REF_BASE_URL = 'ANYSEARCH_BASE_URL';
export const ANYSEARCH_REF_MAX_RESULTS = 'ANYSEARCH_MAX_RESULTS';
export const ANYSEARCH_REF_ZONE = 'ANYSEARCH_ZONE';
export const ANYSEARCH_REF_LANGUAGE = 'ANYSEARCH_LANGUAGE';
export const ANYSEARCH_REF_FORMAT = 'ANYSEARCH_FORMAT';
/** AnySearch's own result-count bound. */
export const ANYSEARCH_MAX_RESULTS_LIMIT = 20;
/** Provider default when the seam passes no bound. */
export const ANYSEARCH_DEFAULT_MAX_RESULTS = 10;
/** Attribution header sent on every request; bump with the package version. */
const USER_AGENT = 'deepseek-harness-web-search-anysearch/0.1.0';
//#endregion

/** Options one search operation resolves against (a per-operation snapshot). */
interface AnySearchOptions {
  /** Literal key from config; when absent the credential thunk is used. */
  apiKey?: string;
  /** Resolve the API key through the credentials service / launch env. */
  resolveApiKey?: () => Promise<string | undefined>;
  apiKeyEnv: string;
  /** Resolve one configuration reference (credentials service / launch env). */
  resolveConfigRef: (ref: string) => Promise<string | undefined>;
  /** Fallbacks from settings/env/defaults; credential refs override them. */
  baseURL: string;
  maxResults: number;
  format: string;
  tag?: string;
  zone?: string;
  language?: string;
}

function nonEmpty(value: string | undefined): string | undefined {
  return value !== undefined && value.length > 0 ? value : undefined;
}

/**
 * The AnySearch-backed search provider; HTTP redirects fail as
 * `WEB_PROVIDER_ERROR`. Credential refs are re-resolved per operation so GUI
 * changes apply on the next search without a restart.
 */
export class AnySearchProvider {
  readonly id = ANYSEARCH_PROVIDER_ID;

  constructor(private readonly resolveOptions: () => AnySearchOptions) {}

  /** Cheap local usability check; never makes a network call. */
  available(): boolean {
    const options = this.resolveOptions();
    const hasKey =
      (options.apiKey?.length ?? 0) > 0 || options.resolveApiKey !== undefined;
    const hasUrl = URL.canParse(options.baseURL);
    const resultsInRange =
      Number.isInteger(options.maxResults) &&
      options.maxResults >= 1 &&
      options.maxResults <= ANYSEARCH_MAX_RESULTS_LIMIT;
    return hasKey && hasUrl && resultsInRange;
  }

  async search(
    request: { query: string; maxResults?: number },
    signal?: AbortSignal,
  ): Promise<{ sources: Array<{ url: string; title?: string; snippet?: string }>; truncated: boolean }> {
    const options = this.resolveOptions();
    const apiKey = await this.apiKey(options, signal);
    throwIfSearchAborted(signal);

    // Credential refs written by the GUI card win over settings/env/defaults.
    const [refBaseURL, refMaxResults, refZone, refLanguage, refFormat] = await Promise.all([
      options.resolveConfigRef(ANYSEARCH_REF_BASE_URL),
      options.resolveConfigRef(ANYSEARCH_REF_MAX_RESULTS),
      options.resolveConfigRef(ANYSEARCH_REF_ZONE),
      options.resolveConfigRef(ANYSEARCH_REF_LANGUAGE),
      options.resolveConfigRef(ANYSEARCH_REF_FORMAT),
    ]);
    const baseURL = nonEmpty(refBaseURL) ?? options.baseURL;
    const maxResults = clampMaxResults(
      nonEmpty(refMaxResults) !== undefined ? Number(refMaxResults) : undefined,
      request.maxResults ?? options.maxResults,
      ANYSEARCH_MAX_RESULTS_LIMIT,
    );
    const zone = nonEmpty(refZone) ?? options.zone;
    const language = nonEmpty(refLanguage) ?? options.language;
    const format = nonEmpty(refFormat) ?? options.format;

    const endpoint = `${baseURL.replace(/\/+$/u, '')}/v1/search`;
    const body = {
      query: request.query,
      max_results: maxResults,
      format: format === 'markdown' ? 'markdown' : 'json',
      ...(options.tag !== undefined && options.tag.length > 0 ? { tag: options.tag } : {}),
      ...(zone === 'cn' || zone === 'intl' ? { zone } : {}),
      ...(language !== undefined && language.length > 0 ? { language } : {}),
    };

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        redirect: 'error',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          accept: 'application/json',
          'user-agent': USER_AGENT,
        },
        body: JSON.stringify(body),
        ...(signal !== undefined ? { signal } : {}),
      });
    } catch (error) {
      if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
      throw new WebError(`AnySearch search request failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', {
        cause: error,
      });
    }

    if (!response.ok) {
      const text = await safeReadBody(response, signal);
      throw new WebError(anySearchErrorDetail(text, response.status), 'WEB_PROVIDER_ERROR');
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch (error) {
      if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
      throw new WebError(
        `AnySearch returned an unprocessable response body: ${String(error)}`,
        'WEB_PROVIDER_ERROR',
        { cause: error },
      );
    }
    try {
      return mapAnySearchResponse(parsed as Parameters<typeof mapAnySearchResponse>[0]);
    } catch (error) {
      if (error instanceof WebError) throw error;
      throw new WebError(String((error as Error)?.message ?? error), 'WEB_PROVIDER_ERROR', {
        cause: error,
      });
    }
  }

  /** Resolve one operation's credential without retaining it on the provider. */
  private async apiKey(options: AnySearchOptions, signal?: AbortSignal): Promise<string> {
    throwIfSearchAborted(signal);
    if (options.apiKey !== undefined && options.apiKey.length > 0) return options.apiKey;
    let resolved: string | undefined;
    try {
      resolved = await abortable(options.resolveApiKey?.() ?? Promise.resolve(undefined), signal);
    } catch (error) {
      if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
      throw new WebError(
        `AnySearch search credential resolution failed: ${String(error)}`,
        'WEB_PROVIDER_ERROR',
        { cause: error },
      );
    }
    if (resolved !== undefined && resolved.length > 0) return resolved;
    throw new WebError(
      `AnySearch search has no API key for "${options.apiKeyEnv ?? ANYSEARCH_DEFAULT_API_KEY_ENV}"; store it through the credentials service (the Plugins -> Web Search (AnySearch) card writes it), export it in the launching environment, or set a literal "apiKey" in the web-search-anysearch config`,
      'WEB_PROVIDER_CREDENTIAL_MISSING',
    );
  }
}

/** Read a failed response body without letting a broken stream shadow the status. */
async function safeReadBody(response: Response, signal?: AbortSignal): Promise<string> {
  try {
    return await response.text();
  } catch (error) {
    if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
    return '';
  }
}

/**
 * Race a same-process asynchronous preflight against caller cancellation. The
 * attached settlement handlers keep observing an uncooperative operation after
 * abort so a later rejection cannot become an unhandled rejection.
 */
function abortable(
  operation: Promise<string | undefined>,
  signal?: AbortSignal,
): Promise<string | undefined> {
  if (signal === undefined) return operation;
  if (signal.aborted) return Promise.reject(searchAborted(signal));
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      reject(searchAborted(signal));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(new Error(String(error).replace(/^Error: /u, ''), { cause: error }));
      },
    );
  });
}

/** Throw the provider's stable cancellation error when the caller already aborted. */
function throwIfSearchAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) throw searchAborted(signal);
}

/** Build the provider's stable cancellation error while retaining the caller's reason. */
function searchAborted(signal?: AbortSignal, fallback?: unknown): WebError {
  return new WebError('AnySearch search aborted', 'WEB_ABORTED', {
    cause: signal?.aborted === true ? signal.reason : fallback,
  });
}

/** True for a fetch/`AbortSignal` abort, surfaced as `WEB_ABORTED`. */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

//#region plugin registration
/**
 * Register an AnySearch-backed provider in `ctx.web`. It calls the plain
 * search endpoint `POST {baseURL}/v1/search` with `Authorization: Bearer` and
 * a JSON body, and maps the JSON envelope's `data.results[]` into the seam's
 * normalized `WebSearchResult`. Credentials refs are independent of
 * `DEEPSEEK_API_KEY` (default `ANYSEARCH_API_KEY`).
 * @module @dsh-external/dsh-web-search-anysearch
 */
/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-anysearch';
/** The web seam this provider registers into. */
export const inject = ['web'];

/** Settings schema: endpoint, key reference, result bound, and optional request fields. */
export const Config = z.object({
  apiKey: z.string().role('secret'),
  apiKeyEnv: z.string().role('credential-ref').default(ANYSEARCH_DEFAULT_API_KEY_ENV),
  baseURL: z.string().default(ANYSEARCH_DEFAULT_BASE_URL),
  maxResults: z
    .number()
    .step(1)
    .min(1)
    .max(ANYSEARCH_MAX_RESULTS_LIMIT)
    .default(ANYSEARCH_DEFAULT_MAX_RESULTS),
  tag: z.string(),
  zone: z.string(),
  language: z.string(),
  format: z.string().default('json'),
});

/** Settings namespace carrying this provider's endpoint, key reference, and optional request fields. */
export const WEB_SEARCH_ANYSEARCH_SETTINGS_NAMESPACE = settingsNamespace('web-search-anysearch');

/** Register the AnySearch search provider with `ctx.web`. */
export function apply(ctx: import('@deepseek-ai/cordis').Context, config: z.Infer<typeof Config>): void {
  let current: () => z.Infer<typeof Config> = () => config;
  installSettingsSection(ctx, WEB_SEARCH_ANYSEARCH_SETTINGS_NAMESPACE, Config, config, {
    setSource: (source) => {
      current = source;
    },
    onChange: () => {},
  });
  ctx.web.registerSearchProvider(
    new AnySearchProvider(() => resolveOptions(ctx, current())),
  );
}

/** Project one resolved section into the options the provider serves its next search with. */
function resolveOptions(
  ctx: import('@deepseek-ai/cordis').Context,
  config: z.Infer<typeof Config>,
): AnySearchOptions {
  const apiKeyEnv = credentialRef(config.apiKeyEnv ?? ANYSEARCH_DEFAULT_API_KEY_ENV);
  const literalApiKey = config.apiKey !== undefined && config.apiKey.length > 0 ? config.apiKey : undefined;
  return {
    ...(literalApiKey === undefined ? {} : { apiKey: literalApiKey }),
    resolveApiKey: async () => {
      const credentials = ctx.get('credentials');
      if (credentials !== undefined) return (await credentials.resolve(apiKeyEnv))?.value;
      const ambient = launchEnvironmentOf(ctx).get(apiKeyEnv);
      return ambient !== undefined && ambient.value.length > 0 ? ambient.value : undefined;
    },
    resolveConfigRef: async (ref: string) => {
      const credentials = ctx.get('credentials');
      if (credentials !== undefined) return (await credentials.resolve(credentialRef(ref)))?.value;
      const ambient = launchEnvironmentOf(ctx).get(ref);
      return ambient !== undefined && ambient.value.length > 0 ? ambient.value : undefined;
    },
    apiKeyEnv,
    baseURL: config.baseURL ?? ANYSEARCH_DEFAULT_BASE_URL,
    maxResults: config.maxResults ?? ANYSEARCH_DEFAULT_MAX_RESULTS,
    format: config.format ?? 'json',
    tag: config.tag,
    zone: config.zone,
    language: config.language,
  };
}
//#endregion

export { mapAnySearchResponse, anySearchErrorDetail, clampMaxResults } from './map.js';
