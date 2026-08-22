[CmdletBinding()]
param(
    [string] $ExternalActivityId,
    [ValidateSet("sent", "received", "hold", "draft", "research", "low_priority", "skipped", "error")]
    [string] $Status = "sent",
    [ValidateSet("email", "call", "meeting", "note")]
    [string] $ActivityType = "email",
    [string] $Contact,
    [string] $Company,
    [string] $Email,
    [string] $ContactPhone,
    [string] $Subject,
    [string] $Notes,
    [string] $ProspectId,
    [string] $ListingId,
    [string] $Address,
    [string] $Latitude,
    [string] $Longitude,
    [string] $PlaceId,
    [string] $GoogleMapsUrl,
    [string] $WebsiteUrl,
    [string] $AddressEvidenceUrl,
    [ValidateSet("company_website", "google_maps", "municipal", "outlook", "manual", "other")]
    [string] $AddressSource,
    [ValidateRange(0, 100)]
    [int] $AddressConfidence = 0,
    [switch] $AddressVerified,
    [string] $RunId,
    [string] $ActivityAt = [DateTimeOffset]::Now.ToString("o"),
    [string] $Endpoint = "https://levelcre-production.up.railway.app/api/agent/sales-activity/batch",
    [string] $MapEndpoint = "https://levelcre-production.up.railway.app/api/agent/sales-prospect-maps/batch",
    [string] $ConfigPath = "$env:USERPROFILE\.codex\secrets\levelcre-sales-activity.json",
    [string] $OutboxPath = "$env:USERPROFILE\.codex\state\levelcre-sales-activity-outbox.jsonl",
    [string] $MapOutboxPath = "$env:USERPROFILE\.codex\state\levelcre-sales-prospect-map-outbox.jsonl",
    [switch] $FlushOnly,
    [string] $Source = "codex_followup"
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

function Add-ToMapOutbox {
    param([object] $Candidate)

    $directory = Split-Path -Parent $MapOutboxPath
    if (-not (Test-Path -LiteralPath $directory)) {
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }
    Add-Content -LiteralPath $MapOutboxPath -Value ($Candidate | ConvertTo-Json -Depth 8 -Compress) -Encoding UTF8
}

function ConvertTo-Coordinate {
    param(
        [string] $Value,
        [double] $Minimum,
        [double] $Maximum
    )

    if ([string]::IsNullOrWhiteSpace($Value)) { return $null }
    $parsed = 0.0
    $styles = [System.Globalization.NumberStyles]::Float
    $culture = [System.Globalization.CultureInfo]::InvariantCulture
    if (-not [double]::TryParse($Value, $styles, $culture, [ref] $parsed)) { return $null }
    if ($parsed -lt $Minimum -or $parsed -gt $Maximum) { return $null }
    return $parsed
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

function Send-MapCandidates {
    param(
        [object[]] $Candidates,
        [string] $ApiKey,
        [string] $BatchRunId
    )

    if ($Candidates.Count -eq 0) { return $null }
    $payload = [ordered]@{
        source = "codex_sales_prospect"
        runId = $BatchRunId
        candidates = $Candidates
    }
    return Invoke-RestMethod `
        -Method Post `
        -Uri $MapEndpoint `
        -Headers @{ "x-levelcre-sales-key" = $ApiKey } `
        -ContentType "application/json" `
        -Body ($payload | ConvertTo-Json -Depth 10 -Compress) `
        -TimeoutSec 30
}

function Get-FailedBatchItems {
    param(
        [object[]] $Items,
        [object] $Result
    )

    if ($Items.Count -eq 0) { return @() }
    if ($null -eq $Result) { return @($Items) }
    $errorCount = if ($Result.PSObject.Properties.Name -contains "errors") { [int]$Result.errors } else { 0 }
    if ($errorCount -le 0) { return @() }
    $rows = @(if ($Result.PSObject.Properties.Name -contains "results") { $Result.results })
    if ($rows.Count -ne $Items.Count) { return @($Items) }

    $failed = @()
    for ($index = 0; $index -lt $Items.Count; $index += 1) {
        $row = $rows[$index]
        if ($null -eq $row -or ($row.PSObject.Properties.Name -contains "error" -and -not [string]::IsNullOrWhiteSpace([string]$row.error))) {
            $failed += $Items[$index]
        }
    }
    if ($failed.Count -eq 0 -and $errorCount -gt 0) { return @($Items) }
    return @($failed)
}

function Set-OutboxItems {
    param(
        [string] $Path,
        [object[]] $Items
    )

    if ($Items.Count -eq 0) {
        if (Test-Path -LiteralPath $Path) { Remove-Item -LiteralPath $Path -Force }
        return
    }
    $directory = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $directory)) {
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }
    $lines = @($Items | ForEach-Object { $_ | ConvertTo-Json -Depth 8 -Compress })
    Set-Content -LiteralPath $Path -Value $lines -Encoding UTF8
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
if ($null -ne $config -and $config.PSObject.Properties.Name -contains "mapEndpoint" -and -not [string]::IsNullOrWhiteSpace([string]$config.mapEndpoint)) {
    $MapEndpoint = [string]$config.mapEndpoint
}

$activity = $null
$mapCandidate = $null
$mapQueueWarning = $null
if (-not $FlushOnly.IsPresent) {
    if ([string]::IsNullOrWhiteSpace($ExternalActivityId)) {
        $ExternalActivityId = Get-StableActivityId -Seed (@($Status, $ActivityType, $Email, $Subject, $ActivityAt) -join "|")
    }
    $activity = [ordered]@{
        source = $Source
        externalActivityId = $ExternalActivityId
        activityAt = $ActivityAt
        activityType = $ActivityType
        status = $Status
        contact = $Contact
        company = $Company
        email = $Email
        contactPhone = $ContactPhone
        subject = $Subject
        notes = $Notes
        prospectId = $ProspectId
        listingId = $ListingId
        propertyAddress = $Address
        latitude = ConvertTo-Coordinate -Value $Latitude -Minimum -90 -Maximum 90
        longitude = ConvertTo-Coordinate -Value $Longitude -Minimum -180 -Maximum 180
        placeId = $PlaceId
        websiteUrl = $WebsiteUrl
        addressSource = $AddressSource
        addressConfidence = $AddressConfidence
        addressVerified = $AddressVerified.IsPresent
    }

    if ($AddressVerified.IsPresent -and $Status -eq "sent") {
        $mapLatitude = ConvertTo-Coordinate -Value $Latitude -Minimum -90 -Maximum 90
        $mapLongitude = ConvertTo-Coordinate -Value $Longitude -Minimum -180 -Maximum 180
        if (
            [string]::IsNullOrWhiteSpace($Company) -or
            [string]::IsNullOrWhiteSpace($Address) -or
            $null -eq $mapLatitude -or
            $null -eq $mapLongitude -or
            [string]::IsNullOrWhiteSpace($AddressSource) -or
            $AddressConfidence -lt 80
        ) {
            $mapQueueWarning = "Verified map candidates require company, address, valid coordinates, address source, and confidence of at least 80."
        } else {
            $mapCandidate = [ordered]@{
                externalActivityId = $ExternalActivityId
                activitySource = $Source
                observedAt = $ActivityAt
                company = $Company
                contactName = $Contact
                contactEmail = $Email
                contactPhone = $ContactPhone
                websiteUrl = $WebsiteUrl
                address = $Address
                latitude = $mapLatitude
                longitude = $mapLongitude
                placeId = $PlaceId
                googleMapsUrl = $GoogleMapsUrl
                evidenceUrl = $AddressEvidenceUrl
                addressSource = $AddressSource
                confidence = $AddressConfidence
                verified = $true
                notes = "Verified during Codex sales follow-up research."
            }
            Add-ToMapOutbox -Candidate $mapCandidate
        }
    }
}

if ([string]::IsNullOrWhiteSpace($apiKey)) {
    if ($null -ne $activity) { Add-ToOutbox -Activity $activity }
    [pscustomobject]@{
        status = if ($null -ne $activity) { "queued_local" } else { "not_configured" }
        reason = "credential_not_configured"
        outbox = $OutboxPath
        mapCandidateQueued = $null -ne $mapCandidate
        mapOutbox = $MapOutboxPath
    } | ConvertTo-Json -Compress
    exit 0
}

$flushed = 0
$activityOutboxRemaining = 0
$activityOutboxWarning = $null
if (Test-Path -LiteralPath $OutboxPath) {
    try {
        $queued = @(Get-Content -LiteralPath $OutboxPath | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | ForEach-Object { $_ | ConvertFrom-Json })
        if ($queued.Count -gt 0) {
            $flushResult = Send-Activities -Activities $queued -ApiKey $apiKey -BatchRunId "outbox-flush"
            $failedQueued = @(Get-FailedBatchItems -Items $queued -Result $flushResult)
            $flushed = $queued.Count - $failedQueued.Count
            $activityOutboxRemaining = $failedQueued.Count
            if ($failedQueued.Count -gt 0) {
                $activityOutboxWarning = "$($failedQueued.Count) activity outbox item(s) were rejected and retained for retry."
            }
            Set-OutboxItems -Path $OutboxPath -Items $failedQueued
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
    $mapFlushed = 0
    $mapResult = $null
    $mapStatus = "empty"
    $mapOutboxRemaining = 0
    if (Test-Path -LiteralPath $MapOutboxPath) {
        try {
            $queuedMapCandidates = @(Get-Content -LiteralPath $MapOutboxPath | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | ForEach-Object { $_ | ConvertFrom-Json })
            if ($queuedMapCandidates.Count -gt 0) {
                $deduplicatedMapCandidates = @($queuedMapCandidates | Group-Object -Property externalActivityId | ForEach-Object { $_.Group[-1] })
                $mapResult = Send-MapCandidates -Candidates $deduplicatedMapCandidates -ApiKey $apiKey -BatchRunId $(if ([string]::IsNullOrWhiteSpace($RunId)) { "map-outbox-flush" } else { $RunId })
                $failedMapCandidates = @(Get-FailedBatchItems -Items $deduplicatedMapCandidates -Result $mapResult)
                $mapFlushed = $deduplicatedMapCandidates.Count - $failedMapCandidates.Count
                $mapOutboxRemaining = $failedMapCandidates.Count
                $mapStatus = if ($failedMapCandidates.Count -gt 0) { "queued_local" } else { "processed" }
                if ($failedMapCandidates.Count -gt 0) {
                    $mapQueueWarning = "$($failedMapCandidates.Count) map candidate(s) were rejected and retained for retry."
                }
                Set-OutboxItems -Path $MapOutboxPath -Items $failedMapCandidates
            }
        } catch {
            $mapStatus = "queued_local"
            $mapQueueWarning = $_.Exception.Message
        }
    }
    [pscustomobject]@{
        status = if ($activityOutboxRemaining -gt 0 -or $mapOutboxRemaining -gt 0) { "queued_local" } else { "flushed" }
        flushed = $flushed
        activityOutboxRemaining = $activityOutboxRemaining
        activityMessage = $activityOutboxWarning
        mapStatus = $mapStatus
        mapFlushed = $mapFlushed
        mapOutboxRemaining = $mapOutboxRemaining
        mapCreated = if ($null -ne $mapResult) { [int]$mapResult.created } else { 0 }
        mapLinkedExisting = if ($null -ne $mapResult) { [int]$mapResult.linkedExisting } else { 0 }
        mapNeedsReview = if ($null -ne $mapResult) { [int]$mapResult.needsReview } else { 0 }
        mapErrors = if ($null -ne $mapResult) { [int]$mapResult.errors } else { 0 }
        mapMessage = $mapQueueWarning
    } | ConvertTo-Json -Compress
    exit 0
}

try {
    $result = Send-Activities -Activities @($activity) -ApiKey $apiKey -BatchRunId $RunId
    $failedCurrent = @(Get-FailedBatchItems -Items @($activity) -Result $result)
    if ($failedCurrent.Count -gt 0) {
        Add-ToOutbox -Activity $activity
        $rejectionMessage = "Level CRE rejected the activity; it was retained for retry."
        if ($result.PSObject.Properties.Name -contains "results") {
            $resultRows = @($result.results)
            if ($resultRows.Count -gt 0 -and $null -ne $resultRows[0] -and $resultRows[0].PSObject.Properties.Name -contains "error") {
                $candidateMessage = [string]$resultRows[0].error
                if (-not [string]::IsNullOrWhiteSpace($candidateMessage)) { $rejectionMessage = $candidateMessage }
            }
        }
        [pscustomobject]@{
            status = "queued_local"
            reason = "api_rejected"
            message = $rejectionMessage
            errors = [int]$result.errors
            flushed = $flushed
            activityOutboxRemaining = $activityOutboxRemaining + 1
            outbox = $OutboxPath
            mapCandidateQueued = $null -ne $mapCandidate
            mapOutbox = $MapOutboxPath
        } | ConvertTo-Json -Compress
        exit 0
    }
    [pscustomobject]@{
        status = "recorded"
        flushed = $flushed
        activityOutboxRemaining = $activityOutboxRemaining
        activityMessage = $activityOutboxWarning
        imported = [int]$result.imported
        matched = [int]$result.matched
        needsReview = [int]$result.needsReview
        duplicates = [int]$result.duplicates
        errors = [int]$result.errors
        mapCandidateQueued = $null -ne $mapCandidate
        mapMessage = $mapQueueWarning
    } | ConvertTo-Json -Compress
} catch {
    Add-ToOutbox -Activity $activity
    [pscustomobject]@{
        status = "queued_local"
        reason = "api_unavailable"
        message = $_.Exception.Message
        outbox = $OutboxPath
        mapCandidateQueued = $null -ne $mapCandidate
        mapOutbox = $MapOutboxPath
    } | ConvertTo-Json -Compress
}
