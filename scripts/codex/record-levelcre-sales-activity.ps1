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
    [string] $ActivityAt,
    [string] $ProducerId = $env:COMPUTERNAME,
    [string] $ScannedThrough,
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

function Get-ItemValue {
    param($Item, [string]$Name, $Default = $null)
    if ($Item -is [System.Collections.IDictionary]) {
        if ($Item.Contains($Name)) { return $Item[$Name] }
    } elseif ($null -ne $Item -and $Item.PSObject.Properties.Name -contains $Name) { return $Item.$Name }
    return $Default
}
function Invoke-OutboxLock {
    param([string]$Path, [scriptblock]$Action)
    $directory = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($Path))
    [IO.Directory]::CreateDirectory($directory) | Out-Null
    $lock = $null
    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    while ($null -eq $lock) {
        try { $lock = [IO.File]::Open("$Path.lock", 'OpenOrCreate', 'ReadWrite', 'None') }
        catch [IO.IOException] {
            if ([DateTime]::UtcNow -gt $deadline) { throw "Outbox is busy; retry recording with the same event identity." }
            Start-Sleep -Milliseconds 50
        }
    }
    try { & $Action } finally { $lock.Dispose() }
}
function Read-OutboxUnlocked {
    param([string]$Path)
    if (-not [IO.File]::Exists($Path)) { return }
    foreach ($line in [IO.File]::ReadAllLines($Path)) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        $item = $line | ConvertFrom-Json
        if (-not (Get-ItemValue $item '_deliveryId')) {
            $item | Add-Member -NotePropertyName '_deliveryId' -NotePropertyValue (Get-StableActivityId -Seed $line)
        }
        $item
    }
}
function Write-OutboxUnlocked {
    param([string]$Path, [object[]]$Items)
    $temporary = "$Path.$([guid]::NewGuid().ToString('N')).tmp"
    $stream = [IO.File]::Open($temporary, 'CreateNew', 'Write', 'None')
    try {
        foreach ($item in $Items) {
            $bytes = [Text.Encoding]::UTF8.GetBytes(($item | ConvertTo-Json -Depth 15 -Compress) + [Environment]::NewLine)
            $stream.Write($bytes, 0, $bytes.Length)
        }
        $stream.Flush($true)
    } finally { $stream.Dispose() }
    try {
        if ([IO.File]::Exists($Path)) { [IO.File]::Replace($temporary, $Path, [NullString]::Value) }
        else { [IO.File]::Move($temporary, $Path) }
    } finally { if ([IO.File]::Exists($temporary)) { [IO.File]::Delete($temporary) } }
}
function Add-OutboxItem {
    param([string]$Path, $Item)
    Invoke-OutboxLock $Path {
        $rows = @(Read-OutboxUnlocked $Path)
        $copy = $Item | ConvertTo-Json -Depth 15 | ConvertFrom-Json
        $copy | Add-Member -NotePropertyName '_deliveryId' -NotePropertyValue ([guid]::NewGuid().ToString()) -Force
        $copy | Add-Member -NotePropertyName '_queuedAt' -NotePropertyValue ([DateTimeOffset]::UtcNow.ToString('o')) -Force
        Write-OutboxUnlocked $Path @($rows + $copy)
    }
}
function Add-ToOutbox { param($Activity) Add-OutboxItem $OutboxPath $Activity }
function Add-ToMapOutbox { param($Candidate) Add-OutboxItem $MapOutboxPath $Candidate }
function Get-OutboxSnapshot {
    param([string]$Path)
    Invoke-OutboxLock $Path { @(Read-OutboxUnlocked $Path) }
}
function Complete-OutboxItems {
    param([string]$Path, [object[]]$Items)
    $ids = @{}
    foreach ($item in $Items) { $ids[[string](Get-ItemValue $item '_deliveryId')] = $true }
    Invoke-OutboxLock $Path {
        $remaining = @(Read-OutboxUnlocked $Path | Where-Object { -not $ids.ContainsKey([string](Get-ItemValue $_ '_deliveryId')) })
        Write-OutboxUnlocked $Path $remaining
    }
}
function Get-FailedBatchItems {
    param([object[]]$Items, $Result)
    if ($null -eq $Result -or (Get-ItemValue $Result 'skipped' $false)) { return $Items }
    $rows = @(Get-ItemValue $Result 'results' @())
    if ($rows.Count -ne $Items.Count) { return $Items }
    for ($index = 0; $index -lt $Items.Count; $index++) {
        $row = $rows[$index]; $item = $Items[$index]
        $source = [string](Get-ItemValue $item 'source' (Get-ItemValue $item 'activitySource' 'codex_followup'))
        $receiptSource = [string](Get-ItemValue $row 'source' (Get-ItemValue $row 'activitySource' $source))
        if ($null -eq $row -or (Get-ItemValue $row 'error') -or
            (Get-ItemValue $row 'receiptStatus' 'applied') -ne 'applied' -or
            [string](Get-ItemValue $row 'externalActivityId') -cne [string](Get-ItemValue $item 'externalActivityId') -or
            $receiptSource -cne $source) { $item }
    }
}
function Invoke-RecorderRequest {
    param([string]$Uri, [object]$Payload, [string]$ApiKey)
    if (([uri]$Uri).Scheme -ne 'https' -and ([uri]$Uri).Host -notin @('localhost','127.0.0.1')) { throw 'Recorder endpoints must use HTTPS.' }
    $body = [Text.Encoding]::UTF8.GetBytes(($Payload | ConvertTo-Json -Depth 15 -Compress))
    for ($attempt = 0; $attempt -lt 3; $attempt++) {
        try { return Invoke-RestMethod -Method Post -Uri $Uri -Headers @{ 'x-levelcre-sales-key' = $ApiKey } -ContentType 'application/json; charset=utf-8' -Body $body -TimeoutSec 30 }
        catch {
            $response = Get-ItemValue $_.Exception 'Response'
            $statusCode = if ($null -ne $response) { [int]$response.StatusCode } else { 0 }
            $delay = [Math]::Pow(2, $attempt) + (Get-Random -Minimum 0 -Maximum 1000) / 1000
            if ($null -ne $response -and $statusCode -eq 429) {
                $header = ''
                try {
                    if ($response.Headers.PSObject.Methods.Name -contains 'GetValues') { $header = [string](@($response.Headers.GetValues('Retry-After'))[0]) }
                    else { $header = [string]$response.Headers['Retry-After'] }
                } catch {}
                $seconds = 0; $retryDate = [DateTimeOffset]::MinValue
                if ([int]::TryParse($header, [ref]$seconds)) { $delay = [Math]::Max($delay, $seconds) }
                elseif ([DateTimeOffset]::TryParse($header, [ref]$retryDate)) { $delay = [Math]::Max($delay, ($retryDate - [DateTimeOffset]::UtcNow).TotalSeconds) }
                $_.Exception.Data['LevelCreRetryNotBefore'] = [DateTimeOffset]::UtcNow.AddSeconds($delay).ToString('o')
            }
            if ($attempt -ge 2 -or $delay -gt 15 -or ($statusCode -ne 0 -and $statusCode -notin @(408,429) -and $statusCode -lt 500)) { throw }
            Start-Sleep -Milliseconds ([int]($delay * 1000))
        }
    }
}
function Flush-Outbox {
    param([string]$Path, [string]$Uri, [string]$Collection, [string]$ApiKey, [string]$BatchRunId)
    $snapshot = @(Get-OutboxSnapshot $Path)
    $cooldown = @(Get-OutboxSnapshot "$Path.retry-after.jsonl")
    if ($cooldown.Count -and [DateTimeOffset]::Parse([string](Get-ItemValue $cooldown[0] 'retryAt')) -gt [DateTimeOffset]::UtcNow) {
        return [pscustomobject]@{ applied = 0; rejected = 0; needsReview = 0; queued = $snapshot.Count; blocked = $false; warning = 'Waiting for the server retry interval.' }
    }
    $applied = 0; $rejected = 0; $needsReview = 0; $blocked = $false; $warning = $null
    $offset = 0
    while ($offset -lt $snapshot.Count) {
        $batch = @(); $bytes = 2048
        while ($offset -lt $snapshot.Count -and $batch.Count -lt 50) {
            $item = $snapshot[$offset]
            $size = [Text.Encoding]::UTF8.GetByteCount(($item | ConvertTo-Json -Depth 15 -Compress))
            if ($size -gt 700000) {
                $item | Add-Member -NotePropertyName '_rejection' -NotePropertyValue 'Item exceeds the request byte budget; retained for review.' -Force
                Add-OutboxItem "$Path.rejected.jsonl" $item
                Complete-OutboxItems $Path @($item)
                $rejected++; $offset++; continue
            }
            if ($bytes + $size -gt 750000) { break }
            $batch += $item; $bytes += $size; $offset++
        }
        if ($batch.Count -eq 0) { continue }
        $wireItems = @($batch | Select-Object -Property * -ExcludeProperty '_deliveryId','_queuedAt','_rejection')
        $payload = @{ source = $(if ($Collection -eq 'candidates') { 'codex_sales_prospect' } else { $Source }); runId = $BatchRunId; schemaVersion = 1; producerId = $ProducerId }
        $payload[$Collection] = $wireItems
        try {
            $result = Invoke-RecorderRequest $Uri $payload $ApiKey
            $failed = @(Get-FailedBatchItems $batch $result)
            $failedIds = @{}
            foreach ($item in $failed) { $failedIds[[string](Get-ItemValue $item '_deliveryId')] = $true }
            $acked = @($batch | Where-Object { -not $failedIds.ContainsKey([string](Get-ItemValue $_ '_deliveryId')) })
            if ($acked.Count -gt 0) { Complete-OutboxItems $Path $acked; $applied += $acked.Count }
            $needsReview += [int](Get-ItemValue $result 'needsReview' 0)
            $rows = @(Get-ItemValue $result 'results' @())
            if ($rows.Count -eq $batch.Count) {
                for ($index = 0; $index -lt $rows.Count; $index++) {
                    $row = $rows[$index]; $item = $batch[$index]
                    if ((Get-ItemValue $row 'error') -and (Get-ItemValue $row 'retryable' $true) -eq $false -and
                        [string](Get-ItemValue $row 'externalActivityId') -ceq [string](Get-ItemValue $item 'externalActivityId')) {
                        $item | Add-Member -NotePropertyName '_rejection' -NotePropertyValue ([string](Get-ItemValue $row 'error')) -Force
                        Add-OutboxItem "$Path.rejected.jsonl" $item
                        Complete-OutboxItems $Path @($item); $rejected++
                    }
                }
            }
            if ($failed.Count) { $warning = 'Some events were not acknowledged. Retained telemetry will be retried; do not resend email.' }
        } catch {
            $response = (Get-ItemValue $_.Exception 'Response')
            $statusCode = if ($null -ne $response) { [int]$response.StatusCode } else { 0 }
            $retryAt = $_.Exception.Data['LevelCreRetryNotBefore']
            if ($retryAt) {
                Invoke-OutboxLock "$Path.retry-after.jsonl" { Write-OutboxUnlocked "$Path.retry-after.jsonl" @([pscustomobject]@{ retryAt = $retryAt }) }
            }
            $blocked = $statusCode -in @(401,403)
            $warning = if ($blocked) { 'Recorder credentials need attention; events remain queued.' } else { 'Delivery unavailable; events remain queued for the next flush.' }
            if ($statusCode -in @(400,413)) {
                foreach ($item in $batch) {
                    $single = @{ source = $(if ($Collection -eq 'candidates') { 'codex_sales_prospect' } else { $Source }); runId = $BatchRunId; schemaVersion = 1; producerId = $ProducerId }
                    $single[$Collection] = @($item | Select-Object -Property * -ExcludeProperty '_deliveryId','_queuedAt','_rejection')
                    try {
                        $singleResult = Invoke-RecorderRequest $Uri $single $ApiKey
                        if (@(Get-FailedBatchItems @($item) $singleResult).Count -eq 0) { Complete-OutboxItems $Path @($item); $applied++ }
                    } catch {
                        $singleResponse = (Get-ItemValue $_.Exception 'Response')
                        if ($null -ne $singleResponse -and [int]$singleResponse.StatusCode -in @(400,413)) {
                            $item | Add-Member -NotePropertyName '_rejection' -NotePropertyValue 'Invalid payload. Correct and replay with the same event identity.' -Force
                            Add-OutboxItem "$Path.rejected.jsonl" $item
                            Complete-OutboxItems $Path @($item); $rejected++
                        } else { break }
                    }
                }
            } else { break }
        }
    }
    [pscustomobject]@{ applied = $applied; rejected = $rejected; needsReview = $needsReview; queued = @(Get-OutboxSnapshot $Path).Count; blocked = $blocked; warning = $warning }
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

$config = $null
if (Test-Path -LiteralPath $ConfigPath) {
    try { $config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json } catch { $config = $null }
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

if ([string]::IsNullOrWhiteSpace($RunId)) { $RunId = [guid]::NewGuid().ToString() }
if ([string]::IsNullOrWhiteSpace($ProducerId)) { $ProducerId = [Environment]::MachineName }
if (-not $FlushOnly -and [string]::IsNullOrWhiteSpace($ActivityAt)) {
    if ([string]::IsNullOrWhiteSpace($ExternalActivityId)) { throw 'Pass the provider message ID or the original confirmed ActivityAt timestamp. Do not resend email.' }
    $ActivityAt = [DateTimeOffset]::UtcNow.ToString('o')
}
if ($ActivityAt) { $ActivityAt = [DateTimeOffset]::Parse($ActivityAt).ToString('o') }
if ($ScannedThrough) { $ScannedThrough = [DateTimeOffset]::Parse($ScannedThrough).ToString('o') }
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

# Both queues are durable before the first network call.
if ($null -ne $activity) { Add-ToOutbox -Activity $activity }
if ([string]::IsNullOrWhiteSpace($apiKey)) {
    [pscustomobject]@{ status = 'queued_local'; reason = 'credential_not_configured'; outbox = $OutboxPath; mapOutbox = $MapOutboxPath } | ConvertTo-Json -Compress
    exit 0
}
try {
    $activityDelivery = Flush-Outbox $OutboxPath $Endpoint 'activities' $apiKey $RunId
    $mapDelivery = Flush-Outbox $MapOutboxPath $MapEndpoint 'candidates' $apiKey $RunId
    $queued = $activityDelivery.queued + $mapDelivery.queued
    $rejected = $activityDelivery.rejected + $mapDelivery.rejected
    $runStatus = if ($activityDelivery.blocked -or $mapDelivery.blocked) { 'blocked' } elseif ($queued) { 'queued_local' } elseif ($rejected -or $activityDelivery.needsReview -or $mapDelivery.needsReview) { 'needs_review' } elseif ($activityDelivery.applied + $mapDelivery.applied) { 'applied' } else { 'idle' }
    $receipt = @{
        producerId = $ProducerId; runId = $RunId; schemaVersion = 1; status = $runStatus
        applied = $activityDelivery.applied + $mapDelivery.applied
        needsReview = $activityDelivery.needsReview + $mapDelivery.needsReview + $rejected
        failed = $rejected; queued = $queued
    }
    if ($ScannedThrough) { $receipt.scannedThrough = $ScannedThrough }
    $receiptPending = $false
    try {
        $runEndpoint = ([uri]::new([uri]$Endpoint, '/api/agent/runs')).AbsoluteUri
        $null = Invoke-RecorderRequest $runEndpoint $receipt $apiKey
    } catch { $receiptPending = $true }
    [pscustomobject]@{
        status = if ($queued) { 'queued_local' } elseif ($rejected) { 'needs_review' } elseif ($FlushOnly) { 'flushed' } else { 'recorded' }
        runStatus = $runStatus; runId = $RunId; producerId = $ProducerId
        flushed = $activityDelivery.applied; mapFlushed = $mapDelivery.applied
        activityOutboxRemaining = $activityDelivery.queued; mapOutboxRemaining = $mapDelivery.queued
        needsReview = $receipt.needsReview; errors = $rejected; receiptPending = $receiptPending
        activityMessage = $activityDelivery.warning; mapMessage = $mapDelivery.warning
        rejectedOutbox = "$OutboxPath.rejected.jsonl"; mapRejectedOutbox = "$MapOutboxPath.rejected.jsonl"
    } | ConvertTo-Json -Compress
} catch {
    [pscustomobject]@{ status = 'queued_local'; reason = 'outbox_recovery_needed'; message = $_.Exception.Message; outbox = $OutboxPath; mapOutbox = $MapOutboxPath } | ConvertTo-Json -Compress
}
