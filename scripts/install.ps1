# install.ps1 — install dsh-web-search-anysearch into a DeepSeek Harness profile.
# Idempotent. Backs up modified files before writing. Does NOT write any API key.
# Usage:  .\install.ps1 [-Web | -Headless | -Both] [-Profile <name>] [-DryRun]
# Example: .\install.ps1 -Web          # install into the web profile only
[CmdletBinding()]
param(
    [switch]$Web,
    [switch]$Headless,
    [switch]$Both,
    [string]$ProfileName,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$PACKAGE = '@dsh-external/dsh-web-search-anysearch'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pluginDir = Split-Path -Parent $scriptDir

# --- Resolve profile selection ---
$profile = 'both'
if ($Web -and -not $Headless) { $profile = 'web' }
if ($Headless -and -not $Web) { $profile = 'headless' }
if ($Both) { $profile = 'both' }
if ($ProfileName) { $profile = $ProfileName }
$profiles = if ($profile -eq 'both') { @('web', 'headless') } else { @($profile) }

# --- Locate DSH home ---
$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
if (-not (Test-Path $dshHome)) { throw "DSH home not found at $dshHome (set DSH_HOME if it lives elsewhere)" }

# --- Locate a Node interpreter: harness-bundled first, then PATH ---
$candidateNodes = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\DeepSeekHarness\node-v24.19.0-win-x64\node.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\DeepSeekHarness\app\node.exe'),
    'node'
)
$node = $null
foreach ($c in $candidateNodes) {
    if ($c -eq 'node') {
        $cmd = Get-Command node -ErrorAction SilentlyContinue
        if ($cmd) { $node = $cmd.Source; break }
    } elseif (Test-Path $c) { $node = $c; break }
}
if (-not $node) { throw 'Node.js not found (neither the DeepSeek Harness bundle nor PATH provides it).' }
Write-Host "Using node: $node"

# --- Locate pnpm via corepack (harness-bundled corepack preferred) ---
$corepackJs = Join-Path (Split-Path $node) 'node_modules\corepack\dist\corepack.js'
$pnpm = $null
if (Test-Path $corepackJs) {
    $pnpm = @($node, $corepackJs, 'pnpm')
} else {
    $pnpmCmd = Get-Command pnpm -ErrorAction SilentlyContinue
    if ($pnpmCmd) { $pnpm = @('pnpm') } else { throw 'pnpm not found and no harness-bundled corepack is available.' }
}

$installer = Join-Path $scriptDir 'install.mjs'

foreach ($p in $profiles) {
    $profileDir = Join-Path $dshHome "profiles\$p"
    if (-not (Test-Path $profileDir)) {
        Write-Warning "Profile directory not found: $profileDir (skipping)"
        continue
    }
    $pkgPath = Join-Path $profileDir 'package.json'
    $patchPath = Join-Path $profileDir 'cordis.patch.yml'

    # --- Backup (timestamped, never overwrites) ---
    $backupDir = Join-Path $profileDir '.anysearch-backup'
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $bak = Join-Path $backupDir $stamp
    New-Item -ItemType Directory -Path $bak -Force | Out-Null
    if (Test-Path $pkgPath) { Copy-Item $pkgPath (Join-Path $bak 'package.json') -Force }
    if (Test-Path $patchPath) { Copy-Item $patchPath (Join-Path $bak 'cordis.patch.yml') -Force }

    if ($DryRun) {
        & $node $installer --profile=$p --home=$dshHome --plugin=$pluginDir --dry-run
    } else {
        # Apply the JSON/YAML edits via Node (no BOM, JSON verified).
        & $node $installer --profile=$p --home=$dshHome --plugin=$pluginDir
        if ($LASTEXITCODE -ne 0) { throw "install.mjs failed for profile $p (exit $LASTEXITCODE)" }

        # Install profile dependencies.
        Push-Location $profileDir
        try {
            & $pnpm[0] @($pnpm[1..($pnpm.Length-1)]) install --no-frozen-lockfile
            if ($LASTEXITCODE -ne 0) { throw "pnpm install failed for profile $p (exit $LASTEXITCODE)" }
        } finally {
            Pop-Location
        }
    }
    Write-Host "OK: profile '$p' processed."
}

Write-Host ''
if ($DryRun) {
    Write-Host 'Dry run complete — nothing was written.'
} else {
    Write-Host "Installation complete. Restart DeepSeek Harness for the changes to take effect."
    Write-Host 'Then open Settings → 网页搜索（AnySearch）and enter your AnySearch API key (stored by the DSH credentials service).'
}
