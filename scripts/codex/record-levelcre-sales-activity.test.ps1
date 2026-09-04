[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$tokens = $null; $parseErrors = $null
$scriptPath = Join-Path $PSScriptRoot 'record-levelcre-sales-activity.ps1'
$ast = [Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw ($parseErrors | Out-String) }
foreach ($definition in $ast.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] }, $false)) {
    . ([scriptblock]::Create($definition.Extent.Text))
}
function Assert-That { param([bool]$Condition, [string]$Message) if (-not $Condition) { throw $Message } }
$testDirectory = Join-Path ([IO.Path]::GetTempPath()) ('levelcre-outbox-test-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($testDirectory) | Out-Null
$Source = 'codex_followup'; $ProducerId = 'test-producer'
$OutboxPath = Join-Path $testDirectory 'activity.jsonl'
$MapOutboxPath = Join-Path $testDirectory 'maps.jsonl'
try {
    Add-ToOutbox @{ externalActivityId = 'a'; source = $Source }
    $snapshot = @(Get-OutboxSnapshot $OutboxPath)
    Add-ToOutbox @{ externalActivityId = 'b'; source = $Source }
    Complete-OutboxItems $OutboxPath $snapshot
    $remaining = @(Get-OutboxSnapshot $OutboxPath)
    Assert-That ($remaining.Count -eq 1 -and $remaining[0].externalActivityId -eq 'b') 'Concurrent append was lost'
    $unacknowledged = @(Get-FailedBatchItems $remaining ([pscustomobject]@{ errors = 0; results = @(); skipped = $true }))
    Assert-That ($unacknowledged.Count -eq 1) 'Skipped response must not acknowledge an event'
    $mismatched = @(Get-FailedBatchItems $remaining ([pscustomobject]@{ errors = 0; results = @([pscustomobject]@{ externalActivityId = 'different' }) }))
    Assert-That ($mismatched.Count -eq 1) 'Receipt identity mismatch must remain queued'
    $wrongSource = @(Get-FailedBatchItems $remaining ([pscustomobject]@{ errors = 0; results = @([pscustomobject]@{ externalActivityId = 'b'; source = 'wrong' }) }))
    Assert-That ($wrongSource.Count -eq 1) 'Receipt source mismatch must remain queued'

    # Load legacy flat JSONL and verify no data is lost while adopting delivery IDs.
    $legacyPath = Join-Path $testDirectory 'legacy.jsonl'
    [IO.File]::WriteAllText($legacyPath, '{"source":"codex_followup","externalActivityId":"legacy"}')
    $legacy = @(Get-OutboxSnapshot $legacyPath)
    Assert-That ($legacy.Count -eq 1) 'Legacy queue did not load'
    Complete-OutboxItems $legacyPath $legacy
    Assert-That (@(Get-OutboxSnapshot $legacyPath).Count -eq 0) 'Legacy receipt could not be acknowledged'

    $script:batchSizes = @()
    $script:appendDuringSend = $false
    function Invoke-RecorderRequest {
        param([string]$Uri, [object]$Payload, [string]$ApiKey)
        $items = if ($Payload.ContainsKey('activities')) { @($Payload.activities) } else { @($Payload.candidates) }
        $script:batchSizes += $items.Count
        if ($script:appendDuringSend) {
            $script:appendDuringSend = $false
            Add-ToOutbox @{ externalActivityId = 'arrived-during-send'; source = $Source }
        }
        $rows = @($items | ForEach-Object { [pscustomobject]@{ externalActivityId = $_.externalActivityId; receiptStatus = 'applied' } })
        [pscustomobject]@{ errors = 0; needsReview = 0; results = $rows }
    }
    $many = @(0..500 | ForEach-Object { [pscustomobject]@{ externalActivityId = "event-$_"; source = $Source; _deliveryId = "delivery-$_" } })
    Invoke-OutboxLock $OutboxPath { Write-OutboxUnlocked $OutboxPath $many }
    $script:appendDuringSend = $true
    $result = Flush-Outbox $OutboxPath 'https://example.test' 'activities' 'synthetic' 'run-1'
    Assert-That ($result.applied -eq 501) 'Large backlog did not flush'
    Assert-That (($script:batchSizes | Measure-Object -Maximum).Maximum -le 50) 'Batch exceeded count limit'
    Assert-That ($result.queued -eq 1) 'Append during real flush was lost'
    $mapItems = @(0..50 | ForEach-Object { [pscustomobject]@{ externalActivityId = "map-$_"; activitySource = $Source; _deliveryId = "map-delivery-$_" } })
    Invoke-OutboxLock $MapOutboxPath { Write-OutboxUnlocked $MapOutboxPath $mapItems }
    $mapResult = Flush-Outbox $MapOutboxPath 'https://example.test' 'candidates' 'synthetic' 'run-2'
    Assert-That ($mapResult.applied -eq 51 -and $mapResult.queued -eq 0) '51 map candidates did not recover'

    function Invoke-RecorderRequest {
        param([string]$Uri, [object]$Payload, [string]$ApiKey)
        [pscustomobject]@{ errors = 1; results = @([pscustomobject]@{ externalActivityId = $Payload.activities[0].externalActivityId; error = 'Invalid prospect'; retryable = $false }) }
    }
    $rejection = Flush-Outbox $OutboxPath 'https://example.test' 'activities' 'synthetic' 'run-3'
    Assert-That ($rejection.rejected -eq 1 -and $rejection.queued -eq 0) 'Permanent validation failure was not isolated'
    Assert-That (@(Get-OutboxSnapshot "$OutboxPath.rejected.jsonl").Count -eq 1) 'Rejected event was not retained'
    Invoke-OutboxLock "$OutboxPath.retry-after.jsonl" { Write-OutboxUnlocked "$OutboxPath.retry-after.jsonl" @([pscustomobject]@{ retryAt = [DateTimeOffset]::UtcNow.AddMinutes(2).ToString('o') }) }
    Add-ToOutbox @{ externalActivityId = 'rate-limited'; source = $Source }
    function Invoke-RecorderRequest { throw 'A request must not run during Retry-After' }
    $cooldownResult = Flush-Outbox $OutboxPath 'https://example.test' 'activities' 'synthetic' 'run-4'
    Assert-That ($cooldownResult.queued -eq 1 -and $cooldownResult.applied -eq 0) 'Retry-After was not preserved across runs'
    Write-Output 'PASS: concurrent append, exact receipts, legacy migration, 501 activities, 51 maps, rejected-event retention'
} finally {
    $resolvedTestDirectory = [IO.Path]::GetFullPath($testDirectory)
    $temporaryRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if ($resolvedTestDirectory.StartsWith($temporaryRoot, [StringComparison]::OrdinalIgnoreCase) -and [IO.Path]::GetFileName($resolvedTestDirectory).StartsWith('levelcre-outbox-test-')) {
        Remove-Item -LiteralPath $resolvedTestDirectory -Recurse -Force
    }
}
