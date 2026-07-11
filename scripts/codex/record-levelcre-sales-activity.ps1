[CmdletBinding()]
param(
    [string] $ExternalActivityId,
    [ValidateSet("sent", "hold", "draft", "research", "low_priority", "skipped", "error")]
    [string] $Status = "sent",
    [ValidateSet("email", "call", "meeting", "note")]
    [string] $ActivityType = "email",
    [string] $Contact,
    [string] $Company,
    [string] $Email,
    [string] $Subject,
    [string] $Notes,
    [string] $ProspectId,
    [string] $ListingId,
    [string] $RunId,
    [string] $ActivityAt = [DateTimeOffset]::Now.ToString("o"),
    [string] $Endpoint = "https://levelcre-production.up.railway.app/api/agent/sales-activity/batch",
    [string] $ConfigPath = "$env:USERPROFILE\.codex\secrets\levelcre-sales-activity.json",
    [string] $OutboxPath = "$env:USERPROFILE\.codex\state\levelcre-sales-activity-outbox.jsonl",
    [switch] $FlushOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-StableActivityId {
    param([string] $Seed)

    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Seed)
        $hash = $sha.ComputeHash($bytes)
        return "codex_" + (([System.BitConverter]::ToString($hash) -replace "-", "").ToLowerInvariant().Substring(0, 24))
    } finally {
        $sha.Dispose()
    }
}

function Add-ToOutbox {
    param([object] $Activity)

    $directory = Split-Path -Parent $OutboxPath
    if (-not (Test-Path -LiteralPath $directory)) {
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }
    Add-Content -LiteralPath $OutboxPath -Value ($Activity | ConvertTo-Json -Depth 8 -Compress) -Encoding UTF8
}

function Send-Activities {
    param(
        [object[]] $Activities,
        [string] $ApiKey,
        [string] $BatchRunId
    )

    if ($Activities.Count -eq 0) { return $null }
    $payload = [ordered]@{
        source = "codex_followup"
        runId = $BatchRunId
        activities = $Activities
    }
    return Invoke-RestMethod `
        -Method Post `
        -Uri $Endpoint `
        -Headers @{ "x-levelcre-sales-key" = $ApiKey } `
        -ContentType "application/json" `
        -Body ($payload | ConvertTo-Json -Depth 10 -Compress) `
        -TimeoutSec 20
}

$config = $null
if (Test-Path -LiteralPath $ConfigPath) {
    $config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
}

$apiKey = [string]$env:LEVELCRE_SALES_ACTIVITY_API_KEY
if ([string]::IsNullOrWhiteSpace($apiKey) -and $null -ne $config -and $config.PSObject.Properties.Name -contains "apiKey") {
    $apiKey = [string]$config.apiKey
}
if ($null -ne $config -and $config.PSObject.Properties.Name -contains "endpoint" -and -not [string]::IsNullOrWhiteSpace([string]$config.endpoint)) {
    $Endpoint = [string]$config.endpoint
}

$activity = $null
if (-not $FlushOnly.IsPresent) {
    if ([string]::IsNullOrWhiteSpace($ExternalActivityId)) {
        $ExternalActivityId = Get-StableActivityId -Seed (@($Status, $ActivityType, $Email, $Subject, $ActivityAt) -join "|")
    }
    $activity = [ordered]@{
        externalActivityId = $ExternalActivityId
        activityAt = $ActivityAt
        activityType = $ActivityType
        status = $Status
        contact = $Contact
        company = $Company
        email = $Email
        subject = $Subject
        notes = $Notes
        prospectId = $ProspectId
        listingId = $ListingId
    }
}

if ([string]::IsNullOrWhiteSpace($apiKey)) {
    if ($null -ne $activity) { Add-ToOutbox -Activity $activity }
    [pscustomobject]@{
        status = if ($null -ne $activity) { "queued_local" } else { "not_configured" }
        reason = "credential_not_configured"
        outbox = $OutboxPath
    } | ConvertTo-Json -Compress
    exit 0
}

$flushed = 0
if (Test-Path -LiteralPath $OutboxPath) {
    try {
        $queued = @(Get-Content -LiteralPath $OutboxPath | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | ForEach-Object { $_ | ConvertFrom-Json })
        if ($queued.Count -gt 0) {
            $null = Send-Activities -Activities $queued -ApiKey $apiKey -BatchRunId "outbox-flush"
            $flushed = $queued.Count
            Remove-Item -LiteralPath $OutboxPath -Force
        }
    } catch {
        if ($null -ne $activity) { Add-ToOutbox -Activity $activity }
        [pscustomobject]@{
            status = "queued_local"
            reason = "outbox_flush_failed"
            message = $_.Exception.Message
            outbox = $OutboxPath
        } | ConvertTo-Json -Compress
        exit 0
    }
}

if ($FlushOnly.IsPresent) {
    [pscustomobject]@{ status = "flushed"; flushed = $flushed } | ConvertTo-Json -Compress
    exit 0
}

try {
    $result = Send-Activities -Activities @($activity) -ApiKey $apiKey -BatchRunId $RunId
    [pscustomobject]@{
        status = "recorded"
        flushed = $flushed
        imported = [int]$result.imported
        matched = [int]$result.matched
        needsReview = [int]$result.needsReview
        duplicates = [int]$result.duplicates
    } | ConvertTo-Json -Compress
} catch {
    Add-ToOutbox -Activity $activity
    [pscustomobject]@{
        status = "queued_local"
        reason = "api_unavailable"
        message = $_.Exception.Message
        outbox = $OutboxPath
    } | ConvertTo-Json -Compress
}
