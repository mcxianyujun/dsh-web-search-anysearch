#!/usr/bin/env node
// Core uninstaller logic: remove the AnySearch dependency and patch entries.
// The `searchProvider: anysearch` override is DELETED (not replaced), so any
// pre-existing provider override in the patch surfaces again; an emptied patch
// normalizes back to "[]" (bundle default).
// Usage: node scripts/uninstall.mjs --profile <web|headless|both> --home <dsh-home> [--dry-run]
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/s);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
  }),
);
const profileArg = args.profile ?? 'both';
const home = resolve(args.home ?? process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? '', '.dsh'));
const dryRun = args['dry-run'] === true;
const PACKAGE_NAME = '@dsh-external/dsh-web-search-anysearch';
const profiles = profileArg === 'both' ? ['web', 'headless'] : [profileArg];

/**
 * Remove this plugin's patch entries without writing a replacement provider.
 * Deletes the insert block and the `searchProvider: anysearch` override, leaving
 * any pre-existing patch entries (including a prior provider override) intact.
 */
function stripPatch(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Our insert block: "- insert:" whose indented children mention web-search-anysearch.
    if (line.trim() === '- insert:') {
      let end = i + 1;
      while (end < lines.length && /^\s/.test(lines[end]) && lines[end].trim() !== '') end++;
      if (lines.slice(i, end).join('\n').includes('web-search-anysearch')) {
        i = end;
        continue;
      }
    }
    // Our provider override: "- id: web" immediately followed by searchProvider: anysearch.
    if (line.trim() === '- id: web' && lines.slice(i, i + 4).some((l) => l.includes('searchProvider: anysearch'))) {
      i += 3;
      continue;
    }
    out.push(line);
    i++;
  }
  const result = out.join('\n');
  const hasEffective = result.split(/\r?\n/).some((l) => l.trim() !== '' && !l.trim().startsWith('#'));
  return hasEffective ? result.replace(/\s+$/u, '') + '\n' : '[]\n';
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
    manifest = JSON.parse(readFileSync(pkgPath, 'utf8'));
  } catch {
    manifest = {};
  }
  if (manifest.dependencies?.[PACKAGE_NAME]) {
    delete manifest.dependencies[PACKAGE_NAME];
    if (Object.keys(manifest.dependencies).length === 0) delete manifest.dependencies;
    pkgChange = true;
  }

  let patchText = '';
  try {
    patchText = readFileSync(patchPath, 'utf8');
  } catch {
    patchText = '[]\n';
  }
  const hasAnysearch = patchText.includes('web-search-anysearch') || patchText.includes('searchProvider: anysearch');
  const newPatch = hasAnysearch ? stripPatch(patchText) : null;
  patchChange = newPatch !== null;

  if (dryRun) {
    summary.push(`${profile}: ${pkgChange ? 'remove dependency' : 'no dependency'} | ${patchChange ? 'restore provider' : 'patch ok'}`);
    continue;
  }
  if (pkgChange) {
    writeFileSync(pkgPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  }
  if (patchChange) {
    writeFileSync(patchPath, newPatch, 'utf8');
  }
  summary.push(`${profile}: ${pkgChange ? 'dependency removed' : 'no dependency'} | ${patchChange ? 'provider restored' : 'patch ok'}`);
}
console.log(summary.join('\n'));
