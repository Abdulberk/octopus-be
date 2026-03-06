param()

$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$sourcePath = Join-Path $projectRoot "node_modules\mqtt\dist\mqtt.min.js"
$targetDir = Join-Path $projectRoot "public\vendor"
$targetPath = Join-Path $targetDir "mqtt.min.js"

if (-not (Test-Path $sourcePath)) {
  throw "mqtt.min.js was not found at '$sourcePath'. Run npm install or pnpm install first."
}

New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
Copy-Item -Path $sourcePath -Destination $targetPath -Force

Write-Host "Prepared browser MQTT asset at $targetPath"
