/**
 * Reproducible tsdown preset for @dsh-external/dsh-web-search-anysearch.
 *
 * - Node half: `src/index.ts` → `lib/index.js` (ESM; `@deepseek-ai/*` stay
 *   external and resolve from the Harness profile tree at runtime). `map.ts`
 *   is inlined and re-exported from the single entry.
 * - Client half: `src/client/index.tsx` → `lib/client.js`, a closure-factory
 *   artifact loaded through the shell's `window.__ModuleLoader__.load` with
 *   externals resolved from the frozen platform module table (react only, for
 *   this package). CSS Modules are not used; all styling is inline.
 */
import { defineConfig } from 'tsdown'

/** The shell's frozen platform module table (mirrors dsh-web-ui). */
const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-schema-form',
] as const

/** Peer APIs resolved from the Harness profile tree at runtime. */
const HOST_EXTERNALS = [
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-web',
  '@deepseek-ai/dsh-settings',
  '@deepseek-ai/dsh-credentials',
  '@deepseek-ai/dsh-launch-environment',
  '@deepseek-ai/schemastery',
] as const

const ID = '@dsh-external/dsh-web-search-anysearch'

export default defineConfig([
  {
    name: ID,
    entry: ['src/index.ts'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    dts: false,
    clean: false,
    fixedExtension: true,
    deps: {
      neverBundle: [...HOST_EXTERNALS],
    },
  },
  {
    name: `${ID}/client`,
    entry: { client: 'src/client/index.tsx' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    dts: false,
    sourcemap: true,
    clean: false,
    fixedExtension: true,
    deps: {
      neverBundle: [...PLATFORM_MODULES],
      alwaysBundle: (id: string) =>
        !(PLATFORM_MODULES as readonly string[]).includes(id),
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
