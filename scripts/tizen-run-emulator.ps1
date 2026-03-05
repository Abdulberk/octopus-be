param(
  [ValidateSet("install", "run")]
  [string]$Step = "install",
  [string]$Target = "emulator-26101",
  [string]$PackagePath = ".output\*.wgt",
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

$TizenCli = Resolve-TizenCli
if (-not $TizenCli) {
  throw "Tizen CLI was not found. Set TIZEN_STUDIO_HOME or add Tizen CLI to PATH."
}

if ($Step -eq "install") {
  $resolvedPackage = $PackagePath
  if ($PackagePath.Contains("*") -or $PackagePath.Contains("?")) {
    $match = Get-ChildItem -Path $PackagePath -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $match) {
      throw "No .wgt package found for pattern '$PackagePath'. Run pnpm tizen:build-web and pnpm tizen:package first."
    }
    $resolvedPackage = $match.FullName
  }

  Write-Host "Installing package on target $Target..."
  & $TizenCli install --name $resolvedPackage --target $Target
  if ($LASTEXITCODE -ne 0) {
    throw "tizen install failed."
  }
  Write-Host "Installation completed."
}

if ($Step -eq "run") {
  if ([string]::IsNullOrWhiteSpace($AppId)) {
    throw "AppId is required for run step. Example: -AppId org.example.player"
  }

  Write-Host "Launching app $AppId on target $Target..."
  & $TizenCli run --target $Target --package $AppId
  if ($LASTEXITCODE -ne 0) {
    throw "tizen run failed."
  }
  Write-Host "Application launched."
}
