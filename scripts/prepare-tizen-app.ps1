param()

$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$stagingRoot = Join-Path $projectRoot ".tizen-app"
$publicSource = Join-Path $projectRoot "public"
$publicTarget = Join-Path $stagingRoot "public"
$configSource = Join-Path $projectRoot "config.xml"
$configTarget = Join-Path $stagingRoot "config.xml"
$templateSource = Join-Path $projectRoot "config\tizen-project-template"
$projectFileSource = Join-Path $templateSource ".project"
$tprojectFileSource = Join-Path $templateSource ".tproject"
$settingsSource = Join-Path $templateSource ".settings"

function Copy-DirectoryContent {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Source,
    [Parameter(Mandatory = $true)]
    [string]$Destination
  )

  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  Get-ChildItem -Path $Source -Force | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination $Destination -Recurse -Force
  }
}

function Add-StagedPlayerConfigOverrides {
  param(
    [Parameter(Mandatory = $true)]
    [string]$PlayerConfigPath
  )

  $overrides = [ordered]@{}

  if ($env:PLAYER_HOST) {
    $overrides.host = $env:PLAYER_HOST
  }

  if ($env:PLAYER_PLAYLIST_ENDPOINT) {
    $overrides.playlistEndpoint = $env:PLAYER_PLAYLIST_ENDPOINT
  }

  if ($env:PLAYER_MQTT_URL) {
    $overrides.mqttUrl = $env:PLAYER_MQTT_URL
  }

  if ($env:PLAYER_DEVICE_ID) {
    $overrides.deviceId = $env:PLAYER_DEVICE_ID
  }

  if ($env:PLAYER_MQTT_USERNAME) {
    $overrides.mqttUsername = $env:PLAYER_MQTT_USERNAME
  }

  if ($env:PLAYER_MQTT_PASSWORD) {
    $overrides.mqttPassword = $env:PLAYER_MQTT_PASSWORD
  }

  if ($overrides.Count -eq 0) {
    Write-Warning "No PLAYER_* overrides were provided. The staged Tizen app will use runtime defaults."
    return
  }

  $json = $overrides | ConvertTo-Json -Compress
  $snippet = @"

(function applyStagedPlayerConfigOverrides() {
  'use strict';
  window.__PLAYER_CONFIG__ = Object.assign($json, window.__PLAYER_CONFIG__ || {});
})();
"@

  Add-Content -Path $PlayerConfigPath -Value $snippet -Encoding ASCII
  Write-Host "Applied staged player config overrides to $PlayerConfigPath"
}

if (-not (Test-Path $publicSource)) {
  throw "Public directory was not found at '$publicSource'."
}

if (-not (Test-Path $configSource)) {
  throw "config.xml was not found at '$configSource'."
}

if (-not (Test-Path $templateSource)) {
  throw "Tizen project template directory was not found at '$templateSource'."
}

if (-not (Test-Path $projectFileSource)) {
  throw "Tizen project template file was not found at '$projectFileSource'."
}

if (-not (Test-Path $tprojectFileSource)) {
  throw "Tizen project template file was not found at '$tprojectFileSource'."
}

if (-not (Test-Path $settingsSource)) {
  throw "Tizen project settings directory was not found at '$settingsSource'."
}

if (Test-Path $stagingRoot) {
  Remove-Item -Path $stagingRoot -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $stagingRoot | Out-Null
Copy-Item -Path $configSource -Destination $configTarget -Force
Copy-DirectoryContent -Source $publicSource -Destination $publicTarget
Copy-Item -Path $projectFileSource -Destination (Join-Path $stagingRoot ".project") -Force
Copy-Item -Path $tprojectFileSource -Destination (Join-Path $stagingRoot ".tproject") -Force
Copy-Item -Path $settingsSource -Destination (Join-Path $stagingRoot ".settings") -Recurse -Force
Add-StagedPlayerConfigOverrides -PlayerConfigPath (Join-Path $publicTarget "player-config.js")

Write-Host "Prepared Tizen staging app at $stagingRoot"
