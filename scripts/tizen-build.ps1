param(
  [ValidateSet("build-web", "package")]
  [string]$Step = "build-web"
)

$ErrorActionPreference = "Stop"
$StagingRoot = ".tizen-app"
$BuildOutputRoot = ".tizen-app\.output"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

function Resolve-TizenCliConfigPath {
  $candidates = @()

  if ($env:TIZEN_STUDIO_HOME) {
    $candidates += (Join-Path $env:TIZEN_STUDIO_HOME "tools\.tizen-cli-config")
  }

  $candidates += "C:\tizen-studio\tools\.tizen-cli-config"

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  return $null
}

function Set-TizenCliProfilesPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ProfilesPath
  )

  $configPath = Resolve-TizenCliConfigPath
  if (-not $configPath) {
    Write-Warning "Tizen CLI config file was not found. Skipping default.profiles.path override."
    return
  }

  $normalizedPath = [System.IO.Path]::GetFullPath($ProfilesPath)
  $escapedPath = $normalizedPath.Replace("\", "\\").Replace(":", "\:")
  $content = Get-Content $configPath

  if ($content -match '^default\.profiles\.path=') {
    $content = $content -replace '^default\.profiles\.path=.*$', "default.profiles.path=$escapedPath"
  } else {
    $content += "default.profiles.path=$escapedPath"
  }

  Set-Content -Path $configPath -Value $content -Encoding ASCII
  Write-Host "Using Tizen security profiles from $normalizedPath"
}

function Resolve-PreferredProfilesPath {
  if ($env:TIZEN_PROFILES_PATH) {
    return $env:TIZEN_PROFILES_PATH
  }

  $localSamsungProfile = Join-Path $RepoRoot ".tizen-samsung-profile\profiles.xml"
  if (Test-Path $localSamsungProfile) {
    return $localSamsungProfile
  }

  $preferred = "C:\tizen-studio-data\ide\keystore\profiles.xml"
  if (Test-Path $preferred) {
    return $preferred
  }

  return $null
}

function Resolve-SignProfileName {
  param(
    [string]$ProfilesPath
  )

  if ($env:TIZEN_SIGN_PROFILE) {
    return $env:TIZEN_SIGN_PROFILE
  }

  if ($ProfilesPath -and $ProfilesPath -like "*.tizen-samsung-profile\profiles.xml") {
    return "samsung"
  }

  return "default"
}

function Prepare-WebAssets {
  $script = Join-Path $PSScriptRoot "prepare-web-assets.ps1"
  & powershell -ExecutionPolicy Bypass -File $script
  if ($LASTEXITCODE -ne 0) {
    throw "Web asset preparation failed."
  }
}

function Prepare-TizenApp {
  $script = Join-Path $PSScriptRoot "prepare-tizen-app.ps1"
  & powershell -ExecutionPolicy Bypass -File $script
  if ($LASTEXITCODE -ne 0) {
    throw "Tizen staging app preparation failed."
  }
}

function Resolve-TizenCli {
  $candidates = @()

  if ($env:TIZEN_STUDIO_HOME) {
    $candidates += (Join-Path $env:TIZEN_STUDIO_HOME "tools\ide\bin\tizen.bat")
    $candidates += (Join-Path $env:TIZEN_STUDIO_HOME "tools\ide\bin\tizen")
  }

  $candidates += "C:\tizen-studio\tools\ide\bin\tizen.bat"
  $candidates += "C:\tizen-studio\tools\ide\bin\tizen"

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  $cli = Get-Command tizen -ErrorAction SilentlyContinue
  if ($cli) {
    return $cli.Source
  }

  return $null
}

$TizenCli = Resolve-TizenCli
if (-not $TizenCli) {
  throw "Tizen CLI was not found. Set TIZEN_STUDIO_HOME or add Tizen CLI to PATH."
}

$ProfilesPath = Resolve-PreferredProfilesPath
if ($ProfilesPath) {
  Set-TizenCliProfilesPath -ProfilesPath $ProfilesPath
}
$SignProfileName = Resolve-SignProfileName -ProfilesPath $ProfilesPath

if ($Step -eq "build-web") {
  Prepare-WebAssets
  Prepare-TizenApp
  Write-Host "Running Tizen web build..."
  if (Test-Path $BuildOutputRoot) {
    Remove-Item -Path $BuildOutputRoot -Recurse -Force
  }
  & $TizenCli build-web -- $StagingRoot --output .output
  if ($LASTEXITCODE -ne 0) {
    throw "tizen build-web failed."
  }
  Write-Host "Build output generated in $BuildOutputRoot"
}

if ($Step -eq "package") {
  Write-Host "Packaging Tizen .wgt with signing profile '$SignProfileName'..."
  if (-not (Test-Path $BuildOutputRoot)) {
    throw "Build output was not found at '$BuildOutputRoot'. Run npm run tizen:build-web first."
  }
  & $TizenCli package --type wgt --sign $SignProfileName -- $BuildOutputRoot
  if ($LASTEXITCODE -ne 0) {
    throw "tizen package failed."
  }
  Write-Host "Package generation completed."
}
