[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRef = 'qzjmdxxhcwvgwislmzeq'
$functionName = 'sync-promesa'
$projectRoot = $PSScriptRoot

function ConvertFrom-SecureValue {
  param([Parameter(Mandatory = $true)][Security.SecureString]$Value)

  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
  try {
    [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

function Invoke-Supabase {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)

  & npx.cmd -y supabase@latest @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Supabase CLI termino con codigo $LASTEXITCODE al ejecutar: $($Arguments -join ' ')"
  }
}

Write-Host "Proyecto de destino: $projectRef" -ForegroundColor Cyan
Write-Host 'El token y el secreto se usan solo durante esta ejecucion y no se guardan.'

$tokenSecure = Read-Host 'Pega tu Personal Access Token de Supabase' -AsSecureString
$syncSecretSecure = Read-Host 'Pega el NUEVO secreto compartido con Google Apps Script' -AsSecureString
$token = ConvertFrom-SecureValue $tokenSecure
$syncSecret = ConvertFrom-SecureValue $syncSecretSecure

if ($token.Length -lt 20) { throw 'El Personal Access Token no parece valido.' }
if ($syncSecret.Length -lt 24) { throw 'El secreto compartido debe tener al menos 24 caracteres.' }

$previousToken = $env:SUPABASE_ACCESS_TOKEN
$tempSecretFile = Join-Path ([IO.Path]::GetTempPath()) ("recepcion-supabase-{0}.env" -f [guid]::NewGuid())

try {
  $env:SUPABASE_ACCESS_TOKEN = $token
  [IO.File]::WriteAllText($tempSecretFile, "SHEETS_SYNC_SECRET=$syncSecret`r`n", [Text.UTF8Encoding]::new($false))

  Push-Location $projectRoot
  try {
    $projects = & npx.cmd -y supabase@latest projects list --output json
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar la cuenta de Supabase.' }
    if (($projects -join "`n") -notmatch [regex]::Escape($projectRef)) {
      throw "El token no tiene acceso al proyecto $projectRef. No se aplico ningun cambio."
    }

    Write-Host 'Comprobando la migracion pendiente...' -ForegroundColor Cyan
    Invoke-Supabase @('db', 'push', '--project-ref', $projectRef, '--include-all', '--dry-run', '--yes')

    $confirmation = Read-Host "Escribe SI para aplicar la migracion y desplegar $functionName"
    if ($confirmation.Trim().ToUpperInvariant() -ne 'SI') {
      throw 'Operacion cancelada antes de aplicar cambios.'
    }

    Invoke-Supabase @('db', 'push', '--project-ref', $projectRef, '--include-all', '--yes')
    Invoke-Supabase @('secrets', 'set', '--project-ref', $projectRef, '--env-file', $tempSecretFile)
    Invoke-Supabase @('functions', 'deploy', $functionName, '--project-ref', $projectRef, '--no-verify-jwt', '--use-api')

    Write-Host 'Verificando el resultado remoto...' -ForegroundColor Cyan
    Invoke-Supabase @('migration', 'list', '--project-ref', $projectRef)
    Invoke-Supabase @('functions', 'list', '--project-ref', $projectRef)
    $secrets = & npx.cmd -y supabase@latest secrets list --project-ref $projectRef --output json
    if ($LASTEXITCODE -ne 0) { throw 'No se pudieron verificar los secretos remotos.' }
    if (($secrets -join "`n") -notmatch 'SHEETS_SYNC_SECRET') {
      throw 'La Edge Function fue desplegada, pero falta SHEETS_SYNC_SECRET.'
    }
    Write-Host 'SHEETS_SYNC_SECRET configurado.' -ForegroundColor Green

    Write-Host 'Supabase quedo desplegado y verificado.' -ForegroundColor Green
  }
  finally {
    Pop-Location
  }
}
finally {
  if (Test-Path -LiteralPath $tempSecretFile) {
    Remove-Item -LiteralPath $tempSecretFile -Force
  }
  if ($null -eq $previousToken) {
    Remove-Item Env:\SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
  }
  else {
    $env:SUPABASE_ACCESS_TOKEN = $previousToken
  }
  $token = $null
  $syncSecret = $null
}
