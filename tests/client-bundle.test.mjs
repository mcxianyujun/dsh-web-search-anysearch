// Verify the built client bundle exports { apply, inject } with the correct
// cordis service names, by simulating the shell's __ModuleLoader__ factory
// handoff under Node. The factory's `require` resolves platform externals
// (react) from the plugin's own node_modules; we only read the returned
// module face (apply/inject), never executing apply.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const bundlePath = join(packageDir, 'lib', 'client.js');
const source = readFileSync(bundlePath, 'utf8');

let captured = null;
globalThis.window = {
  __ModuleLoader__: {
    load: (handoff) => {
      captured = handoff;
    },
  },
};

const localRequire = createRequire(join(packageDir, 'package.json'));
const moduleObj = { exports: {} };
const fn = new Function('module', 'exports', source);
fn(moduleObj, moduleObj.exports);

assert.ok(captured, 'bundle must call window.__ModuleLoader__.load');
assert.equal(captured.id, 'dsh-web-search-anysearch', 'bundle id stamp');
assert.equal(typeof captured.factory, 'function');

const api = captured.factory((spec) => localRequire(spec));
assert.equal(typeof api.apply, 'function', 'apply must be exported');
assert.ok(Array.isArray(api.inject), 'inject must be an array');
assert.deepEqual([...api.inject].sort(), ['connection', 'locale', 'remote', 'slots'], 'inject must name the cordis services');
console.log('OK: client bundle exports apply + inject=[slots, locale, connection, remote]');
