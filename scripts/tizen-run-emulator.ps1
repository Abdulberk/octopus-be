param(
  [ValidateSet("install", "run")]
  [string]$Step = "install",
  [string]$Target = "emulator-26101",
  [string]$PackagePath = ".tizen-app\.output\*.wgt",
  [string]$AppId = ""
)

$ErrorActionPreference = "Stop"

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

function Resolve-SdbCli {
  $candidates = @()

  if ($env:TIZEN_STUDIO_HOME) {
    $candidates += (Join-Path $env:TIZEN_STUDIO_HOME "tools\sdb.exe")
    $candidates += (Join-Path $env:TIZEN_STUDIO_HOME "tools\sdb")
  }

  $candidates += "C:\tizen-studio\tools\sdb.exe"
  $candidates += "C:\tizen-studio\tools\sdb"

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  $cli = Get-Command sdb -ErrorAction SilentlyContinue
  if ($cli) {
    return $cli.Source
  }

  return $null
}

function Assert-ConnectedTarget {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Serial
  )

  $sdbCli = Resolve-SdbCli
  if (-not $sdbCli) {
    Write-Warning "sdb was not found. Skipping connected-target validation."
    return
  }

  $output = & $sdbCli devices 2>$null
  if (-not ($output -match [regex]::Escape($Serial))) {
    throw "Target '$Serial' is not connected. Start the emulator/device and confirm it appears in 'sdb devices' first."
  }
}

$TizenCli = Resolve-TizenCli
if (-not $TizenCli) {
  throw "Tizen CLI was not found. Set TIZEN_STUDIO_HOME or add Tizen CLI to PATH."
}

if ($Step -eq "install") {
  Assert-ConnectedTarget -Serial $Target
  $resolvedPackage = $PackagePath
  if ($PackagePath.Contains("*") -or $PackagePath.Contains("?")) {
    $match = Get-ChildItem -Path $PackagePath -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $match) {
      throw "No .wgt package found for pattern '$PackagePath'. Run npm run tizen:build-web and npm run tizen:package first."
    }
    $resolvedPackage = $match.FullName
  }

  $packageFile = Split-Path -Path $resolvedPackage -Leaf
  $packageDirectory = Split-Path -Path $resolvedPackage -Parent

  Write-Host "Installing package on target $Target..."
  & $TizenCli install -n $packageFile -s $Target -- $packageDirectory
  if ($LASTEXITCODE -ne 0) {
    throw "tizen install failed."
  }
  Write-Host "Installation completed."
}

if ($Step -eq "run") {
  Assert-ConnectedTarget -Serial $Target
  if ([string]::IsNullOrWhiteSpace($AppId)) {
    throw "AppId is required for run step. Pass the package id here. Example: -AppId org.example"
  }

  Write-Host "Launching package $AppId on target $Target..."
  & $TizenCli run -p $AppId -s $Target
  if ($LASTEXITCODE -ne 0) {
    throw "tizen run failed."
  }
  Write-Host "Application launched."
}
