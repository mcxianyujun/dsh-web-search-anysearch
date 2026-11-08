// Settings-installer compatibility regression test.
//
// Harness 0.1.x put `installSection` on the settings service; 0.2.x removed it.
// `apply` must therefore feature-detect the method instead of calling it
// unconditionally: before this guard, a 0.2.x host threw
// "settingsCtx.settings.installSection is not a function" inside `ctx.inject`
// and the provider was never registered, so every search failed with
// WEB_PROVIDER_UNAVAILABLE.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mod = await import(pathToFileURL(join(root, 'lib/index.mjs')).href);

const config = {
  apiKey: '',
  apiKeyEnv: 'ANYSEARCH_API_KEY',
  baseURL: 'https://api.anysearch.com',
  maxResults: 10,
  format: 'json',
};

/** Minimal cordis-like context whose settings service may or may not carry the old installer. */
function fakeContext(withInstaller) {
  const providers = [];
  const installs = [];
  const settings = withInstaller
    ? { installSection: (...args) => installs.push(args) }
    : {};
  const ctx = {
    inject(deps, callback) {
      if (deps.includes('settings')) callback({ settings, get: () => undefined });
    },
    get() {
      return undefined;
    },
    effect(fn) {
      return typeof fn === 'function' ? fn() : undefined;
    },
    web: {
      registerSearchProvider(provider) {
        providers.push(provider);
        return () => {};
      },
    },
  };
  return { ctx, providers, installs };
}

test('registers the provider when the 0.2.x settings service has no installer', () => {
  const { ctx, providers, installs } = fakeContext(false);
  assert.doesNotThrow(() => mod.apply(ctx, config));
  assert.equal(providers.length, 1, 'provider must still be registered');
  assert.equal(providers[0].id, 'anysearch');
  assert.equal(installs.length, 0);
});

test('still installs the section on a 0.1.x settings service', () => {
  const { ctx, providers, installs } = fakeContext(true);
  mod.apply(ctx, config);
  assert.equal(providers.length, 1);
  assert.equal(installs.length, 1, 'legacy installer must keep working');
  assert.equal(installs[0][1], 'web-search-anysearch', 'namespace is unchanged');
});
