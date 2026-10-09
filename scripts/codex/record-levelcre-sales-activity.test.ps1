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
function Reset-EmailEvidenceFixture {
    $script:ActivityType = 'email'; $script:Status = 'sent'; $script:Source = 'codex_followup'
    $script:Email = 'observed@example.test'; $script:ExternalActivityId = 'provider-recorder-email'
    $script:EmailVerification = 'matched_sent_items'; $script:EmailEvidenceId = $script:ExternalActivityId
    $script:ActivityAt = '2026-10-08T10:15:00.000Z'; $script:EmailObservedAt = $script:ActivityAt
    $script:ProspectId = 'existing-test-account'; $script:ContactId = '00000000-0000-4000-8000-000000000001'
    $script:ExpectedEmailContactJson = '{"name":"Saved Contact","email":null,"phone":"780-555-0100","company":"Saved company"}'
    $script:emailEvidenceWarning = $null; $script:emailTargetInvalid = $false
}
try {
    Reset-EmailEvidenceFixture
    $verifiedEmailEvidence = Get-LevelCreEmailEvidence
    Assert-That ($null -ne $verifiedEmailEvidence) 'Verified sent evidence was omitted'
    Assert-That (($verifiedEmailEvidence.Keys -join ',') -ceq 'source,verification,providerMessageId,observedAt') 'Email evidence retained unexpected private fields'
    Assert-That ($verifiedEmailEvidence.source -eq 'outlook_desktop' -and $verifiedEmailEvidence.providerMessageId -eq $ExternalActivityId) 'Email proof lost exact desktop/provider identity'
    Assert-That ([DateTimeOffset]::Parse($verifiedEmailEvidence.observedAt) -eq [DateTimeOffset]::Parse($ActivityAt)) 'Email evidence changed the original message timestamp'
    $expectedEmailContact = Get-LevelCreExpectedEmailContact
    Assert-That ($expectedEmailContact.Count -eq 4 -and $null -eq $expectedEmailContact.email -and -not $script:emailTargetInvalid) 'Exact blank-contact snapshot was not preserved'
    foreach ($case in @(
        @{ values = @{ EmailEvidenceId = 'different-provider' }; reason = 'email_provider_identity_mismatch' },
        @{ values = @{ EmailObservedAt = '2026-10-08T11:15:00.000Z' }; reason = 'email_original_timestamp_mismatch' },
        @{ values = @{ Status = 'received' }; reason = 'email_verification_direction_mismatch' },
        @{ values = @{ Status = 'draft' }; reason = 'unsupported_email_activity' },
        @{ values = @{ Email = 'observed@example.test,other@example.test' }; reason = 'email_counterparty_missing' }
    )) {
        Reset-EmailEvidenceFixture
        foreach ($entry in $case.values.GetEnumerator()) { Set-Variable -Scope Script -Name $entry.Key -Value $entry.Value }
        Assert-That ($null -eq (Get-LevelCreEmailEvidence)) ('Unsafe email proof was accepted: ' + $case.reason)
        Assert-That ($script:emailEvidenceWarning -eq $case.reason) ('Unsafe email proof did not remain reviewable: ' + $case.reason)
    }
    Reset-EmailEvidenceFixture
    $script:EmailVerification = ''; $script:EmailEvidenceId = ''; $script:EmailObservedAt = ''
    Assert-That ($null -eq (Get-LevelCreEmailEvidence)) 'Missing verification unexpectedly supplied email evidence'
    Reset-EmailEvidenceFixture
    $script:Status = 'received'; $script:EmailVerification = 'matched_inbox'
    Assert-That ((Get-LevelCreEmailEvidence).verification -eq 'matched_inbox') 'Verified Inbox evidence was lost'
    foreach ($case in @(
        @{ values = @{ ExpectedEmailContactJson = '' }; reason = 'fresh_email_contact_snapshot_required' },
        @{ values = @{ ExpectedEmailContactJson = '{"name":"Saved Contact","email":null,"phone":null,"company":"Saved company","body":"private"}' }; reason = 'invalid_email_contact_snapshot' },
        @{ values = @{ ContactId = 'invalid-contact-id' }; reason = 'invalid_email_contact_snapshot' }
    )) {
        Reset-EmailEvidenceFixture
        foreach ($entry in $case.values.GetEnumerator()) { Set-Variable -Scope Script -Name $entry.Key -Value $entry.Value }
        Assert-That ($null -eq (Get-LevelCreExpectedEmailContact)) 'An unsafe explicit contact snapshot was accepted'
        Assert-That ($script:emailTargetInvalid -and $script:emailEvidenceWarning -eq $case.reason) 'An unsafe contact target did not remain reviewable'
    }
    $emailSummary = Get-LevelCreEmailSummary @(
        [pscustomobject]@{source='codex_followup';externalActivityId='email-a';emailEnrichment=@{status='applied';reason='filled_missing_contact_email'}},
        [pscustomobject]@{source='codex_followup';externalActivityId='email-b';emailEnrichment=@{status='unchanged';reason='existing_email_matches'}},
        [pscustomobject]@{source='codex_followup';externalActivityId='email-c';emailEnrichment=@{status='needs_review';reason='existing_email_conflict'}},
        [pscustomobject]@{source='codex_followup';externalActivityId='email-d';emailEnrichment=@{status='unknown'}},
        [pscustomobject]@{source='codex_followup';externalActivityId='email-a';emailEnrichment=@{status='unchanged';reason='previously_enriched_receipt'}}
    )
    Assert-That ($emailSummary.reported -eq 4 -and $emailSummary.applied -eq 0 -and $emailSummary.unchanged -eq 2 -and $emailSummary.needsReview -eq 1 -and $emailSummary.unconfirmed -eq 1) 'Email summary duplicated receipt credit or treated an unknown result as confirmed'
    Reset-EmailEvidenceFixture
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
        $script:capturedRecorderPayload = $Payload
        $script:batchSizes += $items.Count
        if ($script:appendDuringSend) {
            $script:appendDuringSend = $false
            Add-ToOutbox @{ externalActivityId = 'arrived-during-send'; source = $Source }
        }
        $rows = @($items | ForEach-Object { [pscustomobject]@{ externalActivityId = $_.externalActivityId; receiptStatus = 'applied' } })
        [pscustomobject]@{ errors = 0; needsReview = 0; results = $rows }
    }
    $emailOutboxPath = Join-Path $testDirectory 'verified-email.jsonl'
    $queuedEmail = [pscustomobject]@{externalActivityId=$ExternalActivityId;source=$Source;activityType='email';status='sent';email=$Email;activityAt=$ActivityAt;prospectId=$ProspectId;contactId=$ContactId;emailEvidence=$verifiedEmailEvidence;expectedEmailContact=$expectedEmailContact}
    Invoke-OutboxLock $emailOutboxPath { Write-OutboxUnlocked $emailOutboxPath @($queuedEmail) }
    $emailDelivery = Flush-Outbox $emailOutboxPath 'https://example.test' 'activities' 'synthetic' 'email-run'
    Assert-That ($emailDelivery.applied -eq 1 -and $emailDelivery.queued -eq 0) 'Verified email queue did not acknowledge its exact receipt'
    $deliveredEmail = $script:capturedRecorderPayload.activities[0]
    Assert-That ($deliveredEmail.emailEvidence.providerMessageId -eq $ExternalActivityId -and $deliveredEmail.emailEvidence.verification -eq 'matched_sent_items') 'Durable queue changed email provider evidence'
    Assert-That ([DateTimeOffset]::Parse($deliveredEmail.emailEvidence.observedAt) -eq [DateTimeOffset]::Parse($ActivityAt)) 'Durable queue changed original email evidence time'
    Assert-That ($deliveredEmail.contactId -eq $ContactId -and $deliveredEmail.expectedEmailContact.name -eq 'Saved Contact' -and $null -eq $deliveredEmail.expectedEmailContact.email) 'Durable queue lost exact target or blank email snapshot'
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
    Write-Output 'PASS: concurrent append, exact receipts, legacy migration, 501 activities, 51 maps, rejected-event retention, verified email proof/snapshot/queue/summary'
} finally {
    $resolvedTestDirectory = [IO.Path]::GetFullPath($testDirectory)
    $temporaryRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if ($resolvedTestDirectory.StartsWith($temporaryRoot, [StringComparison]::OrdinalIgnoreCase) -and [IO.Path]::GetFileName($resolvedTestDirectory).StartsWith('levelcre-outbox-test-')) {
        Remove-Item -LiteralPath $resolvedTestDirectory -Recurse -Force
    }
}
