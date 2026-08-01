param(
  [switch]$SkipBackend
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $Root ".env"

if (-not (Test-Path $EnvFile)) {
  Copy-Item (Join-Path $Root ".env.example") $EnvFile
  Write-Host "Created .env from .env.example. Edit the password, then run this script again."
  exit 1
}

Get-Content $EnvFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -and -not $line.StartsWith("#") -and $line -match "^([^=]+)=(.*)$") {
    $key = $matches[1].Trim()
    $value = $matches[2].Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    [Environment]::SetEnvironmentVariable($key, $value, "Process")
  }
}

if (-not $env:OPENCODE_WEB_HOST) { $env:OPENCODE_WEB_HOST = "0.0.0.0" }
if (-not $env:OPENCODE_WEB_PORT) { $env:OPENCODE_WEB_PORT = "8787" }
if (-not $env:OPENCODE_API_URL) { $env:OPENCODE_API_URL = "http://127.0.0.1:4096" }

function Test-LocalPort {
  param([int]$Port)
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $async = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne(500)) { return $false }
    $client.EndConnect($async)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

$backend = $null
if (-not $SkipBackend) {
  if (Test-LocalPort 4096) {
    Write-Host "OpenCode is already listening on 127.0.0.1:4096; reusing the existing server."
  } else {
    $opencode = Get-Command opencode -ErrorAction SilentlyContinue
    if (-not $opencode) {
      throw "The opencode command was not found and port 4096 is not in use. Install OpenCode or start it separately."
    }
    $backend = Start-Process -FilePath $opencode.Source -ArgumentList @("serve", "--hostname", "127.0.0.1", "--port", "4096") -PassThru
    $ready = $false
    for ($attempt = 1; $attempt -le 10; $attempt++) {
      if ($backend.HasExited) {
        throw "OpenCode exited while starting. Check the OpenCode window and the 4096 port."
      }
      if (Test-LocalPort 4096) {
        $ready = $true
        break
      }
      Start-Sleep -Seconds 1
    }
    if (-not $ready) {
      if ($backend -and -not $backend.HasExited) { Stop-Process -Id $backend.Id }
      throw "OpenCode did not become ready on 127.0.0.1:4096 within 10 seconds."
    }
  }
}

try {
  $node = Get-Command node -ErrorAction Stop
  & $node.Source (Join-Path $Root "server.mjs")
} finally {
  if ($backend -and -not $backend.HasExited) {
    Stop-Process -Id $backend.Id
  }
}
