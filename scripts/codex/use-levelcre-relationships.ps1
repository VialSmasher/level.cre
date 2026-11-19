[CmdletBinding()]
param(
  [ValidateSet('Manifest','Search','Company','Broker','Changes','Maintain','Finding')][string]$Action='Manifest',
  [string]$Query,
  [string]$Id,
  [string]$BodyFile
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$configPath=Join-Path $env:USERPROFILE '.codex/secrets/levelcre-relationships.json'
if(!(Test-Path -LiteralPath $configPath)){throw 'Private relationship access is not configured for this Windows profile.'}
$config=Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
# This installed client is Patrick's personal workflow; other brokers need their own harness.
$expectedOwner='cca487b3-eb6f-4e67-b8b3-0a6ac5728099'
if($config.userId -ne $expectedOwner){throw 'This client is locked to the livingstonpatrick1@gmail.com master account.'}
$base='https://levelcre-production.up.railway.app'
if($config.baseUrl -ne $base){throw 'Unexpected relationship API origin.'}
Add-Type -AssemblyName System.Security
$bytes=[Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($config.encryptedApiKey),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
$headers=@{Authorization='Bearer '+[Text.Encoding]::UTF8.GetString($bytes)}
try {
  $manifest=Invoke-RestMethod -Uri "$base/api/intel/directory/manifest" -Headers $headers -TimeoutSec 30
  if($manifest.ownerId -ne $expectedOwner){throw 'Relationship credential identity mismatch. Stop and reconnect the livingstonpatrick1@gmail.com master account.'}
  $path=switch($Action){
    Manifest {'/manifest'}
    Search {'/search?search='+[Uri]::EscapeDataString($Query)}
    Company {if(!$Id){throw 'Company ID is required.'};'/companies/'+[Uri]::EscapeDataString($Id)+'/brief'}
    Broker {if(!$Id){throw 'Broker ID is required.'};'/brokers/'+[Uri]::EscapeDataString($Id)+'/brief'}
    Changes {'/changes'}
    Maintain {if(!$manifest.maintenanceEnabled){throw 'Owner-authorized maintenance is disabled.'};'/maintain'}
    Finding {'/findings'}
  }
  if($Action -eq 'Manifest'){$manifest | ConvertTo-Json -Depth 40}
  elseif($Action -in @('Maintain','Finding')){
    if(!$BodyFile){throw 'A UTF-8 JSON BodyFile is required.'}
    $body=[IO.File]::ReadAllText((Resolve-Path -LiteralPath $BodyFile),[Text.UTF8Encoding]::new($false,$true))
    $payload=$body | ConvertFrom-Json
    if($env:LEVELCRE_DIRECTORY_SYNC_REQUEST_ID){
      $payload | Add-Member -NotePropertyName syncRequestId -NotePropertyValue $env:LEVELCRE_DIRECTORY_SYNC_REQUEST_ID -Force
      $body=$payload | ConvertTo-Json -Depth 40 -Compress
    }
    Invoke-RestMethod -Method Post -Uri ($base+'/api/intel/directory'+$path) -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 30 | ConvertTo-Json -Depth 40
  }else{
    Invoke-RestMethod -Uri ($base+'/api/intel/directory'+$path) -Headers $headers -TimeoutSec 30 | ConvertTo-Json -Depth 40
  }
} finally {
  [Array]::Clear($bytes,0,$bytes.Length)
  $headers.Clear()
}
