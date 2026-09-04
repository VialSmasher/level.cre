[CmdletBinding()]
param(
    [string]$Endpoint = 'https://levelcre-production.up.railway.app/api/agent/mapping-coverage',
    [string]$ConfigPath = "$env:USERPROFILE\.codex\secrets\levelcre-sales-activity.json",
    [string]$OutputPath
)
$ErrorActionPreference = 'Stop'
if (([uri]$Endpoint).Scheme -ne 'https') { throw 'Use the HTTPS LevelCRE API endpoint.' }
$key = $env:LEVELCRE_SALES_ACTIVITY_API_KEY
if (-not $key -and (Test-Path -LiteralPath $ConfigPath)) { $key = (Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json).apiKey }
if (-not $key) { throw 'Configure the scoped LevelCRE sales credential first.' }
$result = Invoke-RestMethod -Uri $Endpoint -Headers @{ 'x-levelcre-sales-key' = $key } -TimeoutSec 30
$json = $result | ConvertTo-Json -Depth 15
if ($OutputPath) { [IO.File]::WriteAllText([IO.Path]::GetFullPath($OutputPath), $json) } else { $json }
