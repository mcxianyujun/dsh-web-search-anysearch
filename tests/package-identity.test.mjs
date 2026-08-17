// Package identity regression tests. These assert (programmatically, not via
// grep) that the published package uses the unscoped npm name
// `dsh-web-search-anysearch` across package metadata, the bundle patch, the
// client bundle ID, and the installer/uninstaller scripts — and that the legacy
// scoped name `@dsh-external/dsh-web-search-anysearch` no longer appears in any
// runtime/current documentation surface (it is allowed only as historical text
// in CHANGELOG.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const NEW_NAME = 'dsh-web-search-anysearch';
const OLD_NAME = '@dsh-external/dsh-web-search-anysearch';

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

test('package.json uses the new unscoped name at version 0.1.1', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.name, NEW_NAME, 'name must be unscoped');
  assert.equal(pkg.version, '0.1.1', 'version must be 0.1.1');
  assert.ok(!pkg.name.includes('@dsh-external'), 'name must not use the @dsh-external scope');
});

test('cordis.patch.yml registers the new name with the unchanged logical id', () => {
  const patch = read('cordis.patch.yml');
  assert.ok(patch.includes(`name: '${NEW_NAME}'`), 'patch row must reference the new name');
  assert.ok(patch.includes('id: web-search-anysearch'), 'logical id must stay web-search-anysearch');
  assert.ok(!patch.includes(OLD_NAME), 'patch must not reference the old name');
});

test('installer/uninstaller scripts use the new name only', () => {
  for (const f of ['scripts/install.mjs', 'scripts/install.ps1', 'scripts/uninstall.mjs', 'scripts/uninstall.ps1']) {
    const src = read(f);
    assert.ok(!src.includes(OLD_NAME), `${f} must not reference the old name`);
  }
  for (const f of ['scripts/install.mjs', 'scripts/install.ps1', 'scripts/uninstall.mjs']) {
    const src = read(f);
    assert.ok(src.includes(NEW_NAME), `${f} must reference the new name`);
  }
});

test('tsdown client bundle ID uses the new name', () => {
  const tsdown = read('tsdown.config.ts');
  assert.ok(tsdown.includes(`const ID = '${NEW_NAME}'`), 'tsdown ID constant must be the new name');
  assert.ok(!tsdown.includes(OLD_NAME), 'tsdown config must not reference the old name');
});

test('README (EN + zh-CN) no longer reference the old name', () => {
  for (const f of ['README.md', 'README.zh-CN.md']) {
    const src = read(f);
    assert.ok(!src.includes(OLD_NAME), `${f} must not reference the old name`);
    assert.ok(src.includes(NEW_NAME), `${f} must reference the new name`);
  }
});
