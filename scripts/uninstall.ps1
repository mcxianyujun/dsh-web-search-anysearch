# uninstall.ps1 — remove dsh-web-search-anysearch from a DeepSeek Harness profile.
# Removes this plugin's dependency, Cordis insert entry, and searchProvider override.
# Preserves any pre-existing provider configuration and unrelated patches; if no
# previous provider override exists, the Harness falls back to its bundle default.
# Does NOT remove other plugins, profiles, node_modules, or credentials.
# Usage:  .\uninstall.ps1 [-Web | -Headless | -Both] [-DryRun]
[CmdletBinding()]
param(
    [switch]$Web,
    [switch]$Headless,
    [switch]$Both,
    [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }

$profile = 'both'
if ($Web -and -not $Headless) { $profile = 'web' }
if ($Headless -and -not $Web) { $profile = 'headless' }
if ($Both) { $profile = 'both' }
$profiles = if ($profile -eq 'both') { @('web', 'headless') } else { @($profile) }

$candidateNodes = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\DeepSeekHarness\node-v24.19.0-win-x64\node.exe'),
    'node'
)
$node = $null
foreach ($c in $candidateNodes) {
    if ($c -eq 'node') { $cmd = Get-Command node -ErrorAction SilentlyContinue; if ($cmd) { $node = $cmd.Source; break } }
    elseif (Test-Path $c) { $node = $c; break }
}
if (-not $node) { throw 'Node.js not found.' }

$uninstaller = Join-Path $scriptDir 'uninstall.mjs'
foreach ($p in $profiles) {
    if (-not (Test-Path (Join-Path $dshHome "profiles\$p"))) { Write-Warning "profile '$p' not found"; continue }
    & $node $uninstaller --profile=$p --home=$dshHome $(if ($DryRun) { '--dry-run' })
    if ($LASTEXITCODE -ne 0) { throw "uninstall.mjs failed for profile $p" }
    Write-Host "OK: profile '$p' processed."
}
Write-Host ''
if ($DryRun) { Write-Host 'Dry run complete — nothing was written.' }
else {
    Write-Host 'Uninstall complete. Run `pnpm install` in each profile directory, then restart DeepSeek Harness.'
}
