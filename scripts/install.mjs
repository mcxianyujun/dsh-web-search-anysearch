#!/usr/bin/env node
// Core installer logic for dsh-web-search-anysearch.
// Modifies a profile's package.json (JSON, no BOM) and cordis.patch.yml idempotently.
// Usage: node scripts/install.mjs --profile <web|headless|both> --plugin-dir <abs> --home <dsh-home> [--dry-run]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/s);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
  }),
);

const profileArg = args.profile ?? 'both';
const home = resolve(args.home ?? process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? '', '.dsh'));
const pluginDir = resolve(args.plugin ?? dirname(new URL(import.meta.url).pathname).replace(/\/scripts$/, ''));
const dryRun = args['dry-run'] === true;
const PACKAGE_NAME = '@dsh-external/dsh-web-search-anysearch';

const profiles = profileArg === 'both' ? ['web', 'headless'] : [profileArg];

function loadJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'));
}

/** Idempotently add/update the link dependency, returning whether it changed. */
function addDependency(manifest) {
  const deps = manifest.dependencies ?? (manifest.dependencies = {});
  const spec = `link:${pluginDir}`;
  if (deps[PACKAGE_NAME] === spec) return false; // already linked here
  deps[PACKAGE_NAME] = spec; // add or re-point
  return true;
}

const PATCH_INSERT = `- insert:\n    - id: web-search-anysearch\n      name: '@dsh-external/dsh-web-search-anysearch'`;
const PATCH_SELECT = `- id: web\n  config:\n    searchProvider: anysearch`;

/** Idempotently add the two patch entries, returning the new text or null. */
function addPatch(patchText) {
  if (patchText.includes('web-search-anysearch') && patchText.includes('searchProvider: anysearch')) {
    return null; // already applied
  }
  const trimmed = patchText.trim();
  if (trimmed === '' || trimmed === '[]') {
    return `${PATCH_INSERT}\n${PATCH_SELECT}\n`;
  }
  // Append to an existing patch list (top-level array).
  if (!patchText.endsWith('\n')) patchText += '\n';
  return `${patchText}${PATCH_INSERT}\n${PATCH_SELECT}\n`;
}

const summary = [];
for (const profile of profiles) {
  const dir = join(home, 'profiles', profile);
  const pkgPath = join(dir, 'package.json');
  const patchPath = join(dir, 'cordis.patch.yml');
  let pkgChange = false;
  let patchChange = false;

  let manifest;
  try {
    manifest = loadJson(pkgPath);
  } catch (e) {
    throw new Error(`cannot read ${pkgPath}: ${e.message}`);
  }
  pkgChange = addDependency(manifest);

  let patchText = '';
  try {
    patchText = readFileSync(patchPath, 'utf8');
  } catch {
    patchText = '[]\n';
  }
  const newPatch = addPatch(patchText);
  patchChange = newPatch !== null;

  if (dryRun) {
    summary.push(`${profile}: ${pkgChange ? 'add dependency' : 'dependency ok'} | ${patchChange ? 'add patch' : 'patch ok'}`);
    continue;
  }

  if (pkgChange) {
    writeFileSync(pkgPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    // Assert no BOM.
    const head = readFileSync(pkgPath).subarray(0, 3);
    if (head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) {
      throw new Error(`BOM detected after writing ${pkgPath}`);
    }
    JSON.parse(readFileSync(pkgPath, 'utf8')); // verify parseable
  }
  if (patchChange) {
    writeFileSync(patchPath, newPatch, 'utf8');
  }
  summary.push(`${profile}: ${pkgChange ? 'dependency added' : 'dependency ok'} | ${patchChange ? 'patch added' : 'patch ok'}`);
}

console.log(summary.join('\n'));
