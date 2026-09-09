// Exercise the built browser plugin against the current Remote credentials
// contract. Values are inert fixtures and are never written outside this test.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(packageDir, 'lib', 'client.js'), 'utf8');
let captured = null;
globalThis.window = {
  __ModuleLoader__: {
    load: (handoff) => {
      captured = handoff;
    },
  },
};
const moduleObj = { exports: {} };
new Function('module', 'exports', source)(moduleObj, moduleObj.exports);
const api = captured.factory((spec) => createRequire(join(packageDir, 'package.json'))(spec));

const calls = [];
const remoteListeners = new Map();
const localListeners = new Map();
let itemInject;
let configured = false;
let failUnsetRef;
const ctx = {
  locale: {
    bind: () => (key) => key,
    register: () => () => {},
  },
  remote: {
    credentials: {
      describe: async (refs) => {
        calls.push(['describe', refs]);
        return { ok: true, value: { ANYSEARCH_API_KEY: { configured, writable: true } } };
      },
      set: async (ref, value) => {
        calls.push(['set', ref, value]);
        if (ref === 'ANYSEARCH_API_KEY') configured = true;
        return { ok: true, value: undefined };
      },
      unset: async (ref) => {
        calls.push(['unset', ref]);
        if (ref === failUnsetRef) return { ok: false, error: { message: 'fixture refusal' } };
        if (ref === 'ANYSEARCH_API_KEY') configured = false;
        return { ok: true, value: undefined };
      },
    },
    $on: (event, listener) => {
      remoteListeners.set(event, listener);
      return () => remoteListeners.delete(event);
    },
  },
  slots: {
    inject: (_name, install) => install(),
    register: (descriptor) => {
      if (descriptor.id === 'anysearch-config') itemInject = descriptor.inject;
      return () => {};
    },
  },
  effect: (install) => install(),
  on: (event, listener) => {
    localListeners.set(event, listener);
    return () => localListeners.delete(event);
  },
};

api.apply(ctx);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(typeof itemInject, 'function', 'settings card must register its operations');
assert.ok(remoteListeners.has('credentials/reference-updated'), 'current credential event must be observed');
assert.ok(!remoteListeners.has('credentials/updated'), 'removed credential event must not be observed');
assert.ok(localListeners.has('connection/reset'), 'reconnect must refresh credential state');

const operations = itemInject();
const blankFields = { baseURL: '', maxResults: '', zone: '', language: '', format: '' };
await operations.save(blankFields, 'fixture-key');
assert.ok(
  calls.some((call) => call[0] === 'set' && call[1] === 'ANYSEARCH_API_KEY' && call[2] === 'fixture-key'),
  'save must use positional set(ref, value)',
);
assert.equal(operations.hooks.anySearchCard.getSnapshot().apiKeyConfigured, true);

await operations.reset();
assert.equal(calls.filter((call) => call[0] === 'unset').length, 6, 'reset must unset every stored ref');
assert.equal(operations.hooks.anySearchCard.getSnapshot().apiKeyConfigured, false);
assert.equal(operations.hooks.anySearchCard.getSnapshot().message, 'resetDone');

failUnsetRef = 'ANYSEARCH_ZONE';
await operations.reset();
assert.equal(
  operations.hooks.anySearchCard.getSnapshot().message,
  'saveFailed',
  'a rejected unset must not be reported as a successful reset',
);

remoteListeners.get('credentials/reference-updated')('ANYSEARCH_API_KEY');
localListeners.get('connection/reset')();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.ok(calls.filter((call) => call[0] === 'describe').length >= 4);
console.log('OK: current remote.credentials save/describe/unset and invalidation contracts');
