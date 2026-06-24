# Downloads the latest PocketBase Windows build into Progs, installs the
# vault_files migration, and starts the server. Run from anywhere.
#
#   powershell -ExecutionPolicy Bypass -File scripts\setup-pocketbase.ps1

$ErrorActionPreference = "Stop"

$InstallDir = "C:\Users\Bilal\Desktop\Progs\pocketbase"
$ProjectDir = Split-Path -Parent $PSScriptRoot
$MigrationsSrc = Join-Path $ProjectDir "pb_migrations"

Write-Host "==> PocketBase setup" -ForegroundColor Cyan

# 1. Resolve the latest Windows amd64 release asset from GitHub.
Write-Host "Resolving latest PocketBase release..."
$release = Invoke-RestMethod -Uri "https://api.github.com/repos/pocketbase/pocketbase/releases/latest" -Headers @{ "User-Agent" = "obsidian-pb-sync" }
$asset = $release.assets | Where-Object { $_.name -match "windows_amd64\.zip$" } | Select-Object -First 1
if (-not $asset) { throw "Could not find a windows_amd64 asset in the latest release." }
Write-Host ("Latest: {0}  ({1})" -f $release.tag_name, $asset.name) -ForegroundColor Green

# 2. Download and extract.
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$zipPath = Join-Path $env:TEMP $asset.name
Write-Host "Downloading $($asset.browser_download_url)"
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zipPath
Write-Host "Extracting to $InstallDir"
Expand-Archive -Path $zipPath -DestinationPath $InstallDir -Force
Remove-Item $zipPath -Force

# 3. Install migration(s).
$MigrationsDst = Join-Path $InstallDir "pb_migrations"
New-Item -ItemType Directory -Force -Path $MigrationsDst | Out-Null
Copy-Item -Path (Join-Path $MigrationsSrc "*.js") -Destination $MigrationsDst -Force
Write-Host "Installed migrations into $MigrationsDst" -ForegroundColor Green

# 4. Start the server.
# Port 8090 is often taken by other dev tools; default to 8095 here.
$exe = Join-Path $InstallDir "pocketbase.exe"
$Port = 8095
Write-Host ""
Write-Host ("==> Starting PocketBase at http://127.0.0.1:{0}" -f $Port) -ForegroundColor Cyan
Write-Host ("    Admin UI:  http://127.0.0.1:{0}/_/" -f $Port) -ForegroundColor Yellow
Write-Host "    First run: open the Admin UI to create a superuser account." -ForegroundColor Yellow
Write-Host "    Then create a regular account in the 'users' collection for the plugin." -ForegroundColor Yellow
Write-Host ""
& $exe serve ("--http=127.0.0.1:{0}" -f $Port)
