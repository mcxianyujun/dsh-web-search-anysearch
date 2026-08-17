// Regression tests for the uninstaller's patch semantics.
// Uses temporary fixture homes under the OS tmpdir — never the real profiles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const node = process.execPath;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const installMjs = join(root, 'scripts', 'install.mjs');
const uninstallMjs = join(root, 'scripts', 'uninstall.mjs');

function makeHome(patchYaml) {
  const home = mkdtempSync(join(tmpdir(), 'dsh-anysearch-uninstall-'));
  const profileDir = join(home, 'profiles', 'testprofile');
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'package.json'), JSON.stringify({ name: 'p', dependencies: {} }, null, 2) + '\n');
  writeFileSync(join(profileDir, 'cordis.patch.yml'), patchYaml);
  return home;
}
function runInstall(home) {
  execFileSync(node, [installMjs, '--profile=testprofile', `--home=${home}`, `--plugin=${root}`], { encoding: 'utf8' });
}
function runUninstall(home) {
  execFileSync(node, [uninstallMjs, '--profile=testprofile', `--home=${home}`], { encoding: 'utf8' });
}
function readPatch(home) {
  return readFileSync(join(home, 'profiles', 'testprofile', 'cordis.patch.yml'), 'utf8');
}
function assertClean(patch, label) {
  assert.ok(!patch.includes('web-search-anysearch'), `${label}: patch must not retain web-search-anysearch`);
  assert.ok(!patch.includes('searchProvider: anysearch'), `${label}: patch must not retain searchProvider: anysearch`);
  assert.ok(!patch.includes('searchProvider: deepseek-official'), `${label}: uninstall must not introduce deepseek-official`);
}

test('A: original [] → install → uninstall → legal []', () => {
  const home = makeHome('[]\n');
  runInstall(home);
  runUninstall(home);
  const patch = readPatch(home);
  assert.equal(patch.trim(), '[]');
  assertClean(patch, 'A');
  rmSync(home, { recursive: true, force: true });
});

test('B: original exa → install → uninstall → restores exa', () => {
  const original = '- id: web\n  config:\n    searchProvider: exa\n';
  const home = makeHome(original);
  runInstall(home);
  runUninstall(home);
  const patch = readPatch(home);
  assert.ok(patch.includes('searchProvider: exa'), 'B: exa must be restored');
  assertClean(patch, 'B');
  rmSync(home, { recursive: true, force: true });
});

test('C: third-party provider + unrelated patch preserved', () => {
  const original = [
    '- id: web',
    '  config:',
    '    searchProvider: perplexity',
    '- id: shell',
    '  config:',
    '    timeoutMs: 30000',
    '',
  ].join('\n');
  const home = makeHome(original);
  runInstall(home);
  runUninstall(home);
  const patch = readPatch(home);
  assert.ok(patch.includes('searchProvider: perplexity'), 'C: perplexity must be restored');
  assert.ok(patch.includes('id: shell'), 'C: unrelated shell entry must be preserved');
  assert.ok(patch.includes('timeoutMs: 30000'), 'C: unrelated shell config must be preserved');
  assertClean(patch, 'C');
  rmSync(home, { recursive: true, force: true });
});

test('D: install ×2 → uninstall ×2 → idempotent, no deepseek-official', () => {
  const home = makeHome('[]\n');
  runInstall(home);
  runInstall(home); // idempotent no-op
  runUninstall(home);
  runUninstall(home); // second uninstall: no-op
  const patch = readPatch(home);
  assert.equal(patch.trim(), '[]');
  assertClean(patch, 'D');
  rmSync(home, { recursive: true, force: true });
});
