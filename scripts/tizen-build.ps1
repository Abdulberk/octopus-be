param(
  [ValidateSet("build-web", "package")]
  [string]$Step = "build-web"
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

if ($Step -eq "build-web") {
  Write-Host "Running Tizen web build..."
  & $TizenCli build-web -- . --output .output
  if ($LASTEXITCODE -ne 0) {
    throw "tizen build-web failed."
  }
  Write-Host "Build output generated in .output/"
}

if ($Step -eq "package") {
  Write-Host "Packaging Tizen .wgt..."
  & $TizenCli package --type wgt --sign default -- .output
  if ($LASTEXITCODE -ne 0) {
    throw "tizen package failed."
  }
  Write-Host "Package generation completed."
}
