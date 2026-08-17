/**
 * Pure AnySearch response mapping and error-shape helpers. Zero runtime
 * dependencies on the Harness - this module is unit-testable standalone.
 * @module @dsh-external/dsh-web-search-anysearch/map
 */

/** AnySearch's own success marker in the JSON envelope (`code`). */
export const ANYSEARCH_OK_CODE = 0;

/** A normalized, deduplicated source in the seam's portable shape. */
export interface AnySearchMappedSource {
  url: string;
  title?: string;
  snippet?: string;
}

/** One `data.results[]` item as observed live: title/url/snippet/content. */
interface AnySearchResultItem {
  title?: unknown;
  url?: unknown;
  snippet?: unknown;
  content?: unknown;
}

/** A well-formed AnySearch `/v1/search` JSON envelope. */
export interface AnySearchEnvelope {
  code?: unknown;
  message?: unknown;
  data?: { results?: unknown };
}

/** The mapped outcome: citeable sources plus the seam's truncation flag. */
export interface AnySearchMappedResult {
  sources: AnySearchMappedSource[];
  truncated: boolean;
}

/**
 * Map a parsed AnySearch `/v1/search` JSON envelope to a normalized search
 * result. A well-formed envelope is `{code, message, request_id, data:{results:[...]}}`
 * with `results[i] = {title, url, snippet, content}` (verified against the live
 * API). A body that carries a non-zero `code` is an application-level failure
 * even on HTTP 200 and throws. Missing/empty `data.results` is a legitimate
 * empty outcome, not an error. Only `title`, `url`, and `snippet` map onto the
 * seam's source shape - AnySearch returns no publication date, so `publishedAt`
 * is never invented. Sources are deduped by `url`; entries without a usable URL
 * are dropped rather than fabricated.
 *
 * @param parsed - the parsed response body (JSON object expected).
 * @returns the normalized result; `truncated` stays `false` because the seam
 *   owns the final `maxResults` enforcement.
 * @throws Error with a stable message when the envelope is malformed or the
 *   application code is non-zero.
 */
export function mapAnySearchResponse(parsed: AnySearchEnvelope): AnySearchMappedResult {
  if (parsed === null || typeof parsed !== 'object') {
    throw new Error('AnySearch returned an unexpected response body');
  }
  if (typeof parsed.code === 'number' && parsed.code !== ANYSEARCH_OK_CODE) {
    const message =
      typeof parsed.message === 'string' && parsed.message.length > 0
        ? parsed.message
        : `AnySearch API error (code ${parsed.code})`;
    throw new Error(message);
  }
  const results = parsed?.data?.results;
  if (results === undefined || results === null) {
    return { sources: [], truncated: false };
  }
  if (!Array.isArray(results)) {
    throw new Error('AnySearch returned an unexpected response shape: data.results is not an array');
  }
  const seen = new Set<string>();
  const sources: AnySearchMappedSource[] = [];
  for (const item of results as AnySearchResultItem[]) {
    if (item === null || typeof item !== 'object') continue;
    const url = typeof item.url === 'string' ? item.url : '';
    if (url.length === 0 || seen.has(url)) continue;
    seen.add(url);
    sources.push({
      url,
      ...(typeof item.title === 'string' && item.title.length > 0 ? { title: item.title } : {}),
      ...(typeof item.snippet === 'string' && item.snippet.length > 0 ? { snippet: item.snippet } : {}),
    });
  }
  return { sources, truncated: false };
}

/**
 * Derive the error detail for a non-2xx response from its (possibly
 * non-JSON) body. AnySearch errors are JSON envelopes with a `message` field
 * (`{"code":-1,"message":"..."}`); the server's own wording is preferred over any
 * client invention. When the body is not parseable, falls back to status-based
 * wording that never fabricates an "invalid key" claim.
 *
 * @param text - the raw response body text.
 * @param status - the HTTP status (for the fallback wording).
 * @returns the detail to throw with.
 */
export function anySearchErrorDetail(text: string, status: number): string {
  let parsed: { message?: unknown } | null = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Body is not JSON; fall through to status-based wording.
  }
  const detail =
    typeof parsed?.message === 'string' && parsed.message.length > 0 ? parsed.message : null;
  if (detail !== null) return detail;
  if (status === 401 || status === 403) return `AnySearch authentication failed (HTTP ${status})`;
  if (status === 429) return `AnySearch request rate limited (HTTP ${status})`;
  return `AnySearch API error (HTTP ${status})`;
}

/**
 * Clamp a requested result count into AnySearch's accepted range.
 * @param value - the requested count (may be NaN/undefined).
 * @param fallback - the provider default when the request is unusable.
 * @returns an integer in [1, 20].
 */
export function clampMaxResults(value: number | undefined, fallback: number, limit = 20): number {
  const n = Math.trunc(value ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, 1), limit);
}
