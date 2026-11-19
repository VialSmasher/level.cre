[CmdletBinding()]
param(
    [ValidateSet('Pending','Review','Cleanup')][string]$Action = 'Pending',
    [Guid]$InteractionId,
    [Guid]$Revision,
    [ValidateSet('suggested','no_action')][string]$State,
    [ValidateSet('call','email')][string]$Channel,
    [string]$DueOn,
    [string]$Reason,
    [string]$IfMissed = '',
    [string]$CleanedNote
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$callKey = $env:LEVELCRE_SALES_ACTIVITY_API_KEY
if (-not $callKey) {
    $configPath = Join-Path $env:USERPROFILE '.codex/secrets/levelcre-sales-activity.json'
    $callKey = (Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json).apiKey
}
if (-not $callKey) { throw 'The Level CRE sales activity credential is unavailable.' }
$base = 'https://levelcre-production.up.railway.app/api/agent/desk-sync/call-notes'
$headers = @{'x-levelcre-sales-key' = $callKey}
if ($Action -eq 'Pending') {
    Invoke-RestMethod -Method Get -Uri $base -Headers $headers -TimeoutSec 30 -MaximumRedirection 0 | ConvertTo-Json -Depth 12
    return
}
if ($Action -eq 'Cleanup') {
    if (-not $InteractionId -or -not $Revision -or [string]::IsNullOrWhiteSpace($CleanedNote)) { throw 'Cleanup needs the exact call ID, revision and cleaned note.' }
    $body = @{revision=$Revision.ToString(); text=$CleanedNote} | ConvertTo-Json -Compress
    Invoke-RestMethod -Method Post -Uri "$base/$InteractionId/cleanup" -Headers $headers -TimeoutSec 30 -MaximumRedirection 0 -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) | ConvertTo-Json -Depth 8
    return
}
if (-not $InteractionId -or -not $Revision -or -not $State) { throw 'Review needs the exact call ID, revision and decision.' }
$decision = @{state=$State}
if ($State -eq 'suggested') {
    if (-not $Channel -or -not $DueOn -or -not $Reason) { throw 'A recommendation needs a channel, date and reason.' }
    $decision = @{state=$State; channel=$Channel; dueOn=$DueOn; reason=$Reason; ifMissed=$IfMissed}
}
$body = @{revision=$Revision.ToString(); decision=$decision} | ConvertTo-Json -Compress
Invoke-RestMethod -Method Post -Uri "$base/$InteractionId/review" -Headers $headers -TimeoutSec 30 -MaximumRedirection 0 -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) | ConvertTo-Json -Depth 8
