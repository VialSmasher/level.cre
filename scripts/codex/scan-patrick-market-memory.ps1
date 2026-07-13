param(
  [int]$Months = 12,
  [int]$MaxMessagesPerFolder = 5000,
  [int]$MaxFiles = 20000,
  [string]$OutputDirectory = "$env:USERPROFILE\.codex\state\levelcre-market-memory"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$cutoff = (Get-Date).AddMonths(-1 * [Math]::Abs($Months))
$runStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$runDirectory = Join-Path $OutputDirectory $runStamp
New-Item -ItemType Directory -Path $runDirectory -Force | Out-Null

$addressPattern = [regex]::new(
  "(?i)\b\d{1,6}\s+(?:[A-Z0-9][A-Z0-9'.-]*\s+){0,5}?(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|trail|trl|way|place|pl|crescent|cres|close|cl|highway|hwy)(?:\s+(?:NW|NE|SW|SE|N|S|E|W))?\b",
  [System.Text.RegularExpressions.RegexOptions]::Compiled
)

$outlookRecords = [System.Collections.Generic.List[object]]::new()
$fileRecords = [System.Collections.Generic.List[object]]::new()
$signalRecords = [System.Collections.Generic.List[object]]::new()
$candidates = @{}
$warnings = [System.Collections.Generic.List[string]]::new()

function Get-StableHash([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) { return $null }
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($value)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $hash = $sha.ComputeHash($bytes)
    return ([BitConverter]::ToString($hash) -replace '-', '').ToLowerInvariant().Substring(0, 24)
  } finally {
    $sha.Dispose()
  }
}

function Get-SafeProperty($item, [string]$name) {
  try {
    $value = $item.$name
    if ($null -eq $value) { return $null }
    $text = [string]$value
    if ([string]::IsNullOrWhiteSpace($text)) { return $null }
    return $text.Trim()
  } catch {
    return $null
  }
}

function Get-DealSignal([string]$text) {
  if ([string]::IsNullOrWhiteSpace($text)) { return $null }
  $signals = [ordered]@{
    offer = '(?i)\b(offer|otl|loi|letter of intent)\b'
    listing_proposal = '(?i)\b(listing proposal|listing agreement|opinion of value|broker opinion|bov)\b'
    tour = '(?i)\b(tour|showing|site visit|walk[- ]?through)\b'
    title = '(?i)\b(land title|title search|pull title)\b'
    requirement = '(?i)\b(requirement|renewal|relocat|expansion|purchase criteria|site criteria)\b'
    meeting = '(?i)\b(meeting|call notes|minutes)\b'
    follow_up = '(?i)\b(follow[- ]?up|checking in|circle back)\b'
  }
  foreach ($entry in $signals.GetEnumerator()) {
    if ($text -match $entry.Value) { return $entry.Key }
  }
  return $null
}

function Get-OpportunityType([string]$sourceName, [string]$signal) {
  if ($sourceName -eq 'PL - Listing Prospects') { return 'listing_pursuit' }
  if ($sourceName -eq 'PL- Tenant Prospects') { return 'tenant_requirement' }
  if ($signal -in @('offer', 'requirement')) { return 'unclassified_deal' }
  return 'unclassified'
}

function Get-TypePriority([string]$type) {
  switch ($type) {
    'listing_pursuit' { return 4 }
    'tenant_requirement' { return 3 }
    'unclassified_deal' { return 2 }
    default { return 1 }
  }
}

function Add-Candidate(
  [string]$address,
  [string]$sourceType,
  [string]$sourceName,
  [datetime]$when,
  [string]$evidence,
  [string]$opportunityType,
  [string]$signal
) {
  $displayAddress = ($address -replace '\s+', ' ').Trim(' ', '.', ',', '-', '_')
  if ([string]::IsNullOrWhiteSpace($displayAddress)) { return }
  $parts = @($displayAddress -split '\s+')
  $suffixIndex = if ($parts[-1] -match '^(?i:NW|NE|SW|SE|N|S|E|W)$') { $parts.Count - 2 } else { $parts.Count - 1 }
  if ($suffixIndex -ge 1) {
    $streetTokenIndex = $suffixIndex - 1
    $numericIndexes = @()
    for ($partIndex = 0; $partIndex -le $streetTokenIndex; $partIndex += 1) {
      if ($parts[$partIndex] -match '^\d') { $numericIndexes += $partIndex }
    }
    $startIndex = 0
    if ($parts[$streetTokenIndex] -match '^\d' -and $numericIndexes.Count -ge 2) {
      $startIndex = $numericIndexes[$numericIndexes.Count - 2]
    } elseif ($parts[$streetTokenIndex] -notmatch '^\d' -and $numericIndexes.Count -ge 1) {
      $startIndex = $numericIndexes[$numericIndexes.Count - 1]
    }
    if ($startIndex -gt 0) {
      $displayAddress = ($parts[$startIndex..($parts.Count - 1)] -join ' ')
      $parts = @($displayAddress -split '\s+')
    }
  }
  if ($parts.Count -lt 3) { return }
  $key = $displayAddress.ToLowerInvariant()
  $key = $key -replace '\b(street)\b', 'st'
  $key = $key -replace '\b(avenue)\b', 'ave'
  $key = $key -replace '\b(road)\b', 'rd'
  $key = $key -replace '\b(boulevard)\b', 'blvd'
  $key = $key -replace '\b(drive)\b', 'dr'
  $key = $key -replace '\b(trail)\b', 'trl'
  $key = $key -replace '\b(place)\b', 'pl'
  $key = $key -replace '\b(crescent)\b', 'cres'
  $key = $key -replace '\b(close)\b', 'cl'
  $key = $key -replace '\b(highway)\b', 'hwy'
  $key = $key -replace '\bparson\b', 'parsons'
  $key = $key -replace '\s+(nw|ne|sw|se|n|s|e|w)$', ''
  $key = ($key -replace '\s+', ' ').Trim()
  if (-not $candidates.ContainsKey($key)) {
    $candidates[$key] = [ordered]@{
      address = $displayAddress
      opportunity_type = $opportunityType
      stage_suggestion = 'target'
      evidence_status = 'inferred'
      evidence_count = 0
      source_types = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
      source_names = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
      signals = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
      last_seen = $when
      sample_evidence = [System.Collections.Generic.List[string]]::new()
    }
  }
  $candidate = $candidates[$key]
  $candidate.evidence_count += 1
  [void]$candidate.source_types.Add($sourceType)
  [void]$candidate.source_names.Add($sourceName)
  if (-not [string]::IsNullOrWhiteSpace($signal)) { [void]$candidate.signals.Add($signal) }
  if ($when -gt $candidate.last_seen) { $candidate.last_seen = $when }
  if ((Get-TypePriority $opportunityType) -gt (Get-TypePriority $candidate.opportunity_type)) {
    $candidate.opportunity_type = $opportunityType
  }
  if ($candidate.sample_evidence.Count -lt 3 -and -not [string]::IsNullOrWhiteSpace($evidence)) {
    $candidate.sample_evidence.Add($evidence.Substring(0, [Math]::Min($evidence.Length, 300)))
  }
}

function Add-EvidenceFromText(
  [string]$text,
  [string]$sourceType,
  [string]$sourceName,
  [datetime]$when,
  [string]$evidence
) {
  if ([string]::IsNullOrWhiteSpace($text)) { return }
  $signal = Get-DealSignal $text
  if ($signal) {
    $signalRecords.Add([pscustomobject]@{
      source_type = $sourceType
      source_name = $sourceName
      occurred_at = $when.ToString('o')
      signal = $signal
      evidence = $evidence.Substring(0, [Math]::Min($evidence.Length, 500))
    })
  }
  $opportunityType = Get-OpportunityType $sourceName $signal
  foreach ($match in $addressPattern.Matches($text)) {
    Add-Candidate $match.Value $sourceType $sourceName $when $evidence $opportunityType $signal
  }
}

function Read-OutlookFolder($folder, [string]$folderName, [string]$dateProperty) {
  $count = 0
  $items = $null
  try {
    $items = $folder.Items
    $items.Sort("[$dateProperty]", $true)
    foreach ($item in $items) {
      if ($count -ge $MaxMessagesPerFolder) { break }
      try {
        if ($item.Class -ne 43) { continue }
        $when = [datetime]$item.$dateProperty
        if ($when -lt $cutoff) { break }
        $count += 1
        $subject = Get-SafeProperty $item 'Subject'
        $conversationTopic = Get-SafeProperty $item 'ConversationTopic'
        $attachmentNames = [System.Collections.Generic.List[string]]::new()
        try {
          $attachmentCount = [Math]::Min([int]$item.Attachments.Count, 20)
          for ($i = 1; $i -le $attachmentCount; $i += 1) {
            $name = Get-SafeProperty $item.Attachments.Item($i) 'FileName'
            if ($name -and $name -notmatch '(?i)(icons8|cwedm_|corporatelogo|linkedin|facebook|instagram|youtube)') {
              $attachmentNames.Add($name)
            }
          }
        } catch {
          $warnings.Add("Could not read attachment metadata for one $folderName message.")
        }
        $record = [pscustomobject]@{
          source = 'outlook_desktop'
          folder = $folderName
          external_id_hash = Get-StableHash (Get-SafeProperty $item 'EntryID')
          occurred_at = $when.ToString('o')
          subject = $subject
          conversation_topic = $conversationTopic
          sender = Get-SafeProperty $item 'SenderEmailAddress'
          recipients = Get-SafeProperty $item 'To'
          cc = Get-SafeProperty $item 'CC'
          attachment_names = @($attachmentNames)
        }
        $outlookRecords.Add($record)
        $evidenceText = @($subject, $conversationTopic, ($attachmentNames -join ' ')) -join ' '
        Add-EvidenceFromText $evidenceText 'outlook' $folderName $when "$folderName | $subject"
      } catch {
        $warnings.Add("Skipped one unreadable $folderName message: $($_.Exception.Message)")
      }
    }
  } finally {
    if ($items) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($items) }
  }
  return $count
}

$outlookCounts = [ordered]@{ sent = 0; inbox = 0 }
$outlook = $null
$namespace = $null
try {
  $outlook = New-Object -ComObject Outlook.Application
  $namespace = $outlook.GetNamespace('MAPI')
  $sentFolder = $namespace.GetDefaultFolder(5)
  $inboxFolder = $namespace.GetDefaultFolder(6)
  $outlookCounts.sent = Read-OutlookFolder $sentFolder 'sent' 'SentOn'
  $outlookCounts.inbox = Read-OutlookFolder $inboxFolder 'inbox' 'ReceivedTime'
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($sentFolder)
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($inboxFolder)
} catch {
  $warnings.Add("Outlook desktop scan was unavailable: $($_.Exception.Message)")
} finally {
  if ($namespace) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($namespace) }
  if ($outlook) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($outlook) }
}

$oneDriveRoot = Join-Path $env:USERPROFILE 'OneDrive - Dynafour Real Estate LTD OA Cushman Wakefield'
$fileSources = [ordered]@{
  'PL - Listing Prospects' = Join-Path $oneDriveRoot 'PL - Listing Prospects'
  'PL- Tenant Prospects' = Join-Path $oneDriveRoot 'PL- Tenant Prospects'
  'Current Projects & Priorities' = Join-Path $oneDriveRoot 'Current Projects & Priorities'
}
$remainingFiles = $MaxFiles
foreach ($source in $fileSources.GetEnumerator()) {
  if ($remainingFiles -le 0) { break }
  if (-not (Test-Path -LiteralPath $source.Value)) {
    $warnings.Add("File source was not found: $($source.Value)")
    continue
  }
  $files = Get-ChildItem -LiteralPath $source.Value -File -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -ge $cutoff } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First $remainingFiles
  foreach ($file in $files) {
    $sourcePrefix = $source.Value.TrimEnd('\') + '\'
    $relativePath = if ($file.FullName.StartsWith($sourcePrefix, [StringComparison]::OrdinalIgnoreCase)) {
      $file.FullName.Substring($sourcePrefix.Length)
    } else {
      $file.FullName
    }
    $fileRecords.Add([pscustomobject]@{
      source = $source.Key
      relative_path = $relativePath
      extension = $file.Extension.ToLowerInvariant()
      modified_at = $file.LastWriteTime.ToString('o')
      size_bytes = $file.Length
    })
    Add-EvidenceFromText $relativePath 'file' $source.Key $file.LastWriteTime "$($source.Key) | $relativePath"
  }
  $remainingFiles -= $files.Count
}

$candidateRows = foreach ($candidate in $candidates.Values) {
  $confidence = 45
  if ($candidate.source_names.Contains('PL - Listing Prospects')) { $confidence = 75 }
  elseif ($candidate.source_names.Contains('PL- Tenant Prospects')) { $confidence = 70 }
  elseif ($candidate.source_types.Contains('file')) { $confidence = 60 }
  if ($candidate.evidence_count -ge 3) { $confidence = [Math]::Min(90, $confidence + 10) }
  if ($candidate.source_types.Count -ge 2) { $confidence = [Math]::Min(95, $confidence + 10) }
  [pscustomobject]@{
    address = $candidate.address
    opportunity_type = $candidate.opportunity_type
    stage_suggestion = $candidate.stage_suggestion
    evidence_status = $candidate.evidence_status
    confidence = $confidence
    evidence_count = $candidate.evidence_count
    last_seen = $candidate.last_seen.ToString('o')
    source_types = (@($candidate.source_types) | Sort-Object) -join '; '
    source_names = (@($candidate.source_names) | Sort-Object) -join '; '
    signals = (@($candidate.signals) | Sort-Object) -join '; '
    sample_evidence = @($candidate.sample_evidence) -join ' || '
    recommended_review = 'Confirm the entity, owner/contact, current status, and whether to create an opportunity.'
  }
}
$candidateRows = @($candidateRows | Sort-Object @{ Expression = 'confidence'; Descending = $true }, @{ Expression = 'evidence_count'; Descending = $true }, @{ Expression = 'last_seen'; Descending = $true })

$outlookPath = Join-Path $runDirectory 'outlook-metadata.jsonl'
$filePath = Join-Path $runDirectory 'file-metadata.csv'
$signalPath = Join-Path $runDirectory 'deal-signals.csv'
$candidatePath = Join-Path $runDirectory 'opportunity-candidates.csv'
$summaryPath = Join-Path $runDirectory 'market-memory-summary.md'

$outlookRecords | ForEach-Object { $_ | ConvertTo-Json -Compress -Depth 5 } | Set-Content -LiteralPath $outlookPath -Encoding utf8
$fileRecords | Export-Csv -LiteralPath $filePath -NoTypeInformation -Encoding utf8
$signalRecords | Export-Csv -LiteralPath $signalPath -NoTypeInformation -Encoding utf8
$candidateRows | Export-Csv -LiteralPath $candidatePath -NoTypeInformation -Encoding utf8

$topCandidates = @($candidateRows | Select-Object -First 25 | ForEach-Object {
  "| $($_.address) | $($_.opportunity_type) | $($_.confidence)% | $($_.evidence_count) | $($_.last_seen.Substring(0, 10)) |"
})
$warningLines = if ($warnings.Count -gt 0) { @($warnings | Select-Object -Unique | ForEach-Object { "- $_" }) } else { @('- None') }
$summary = @(
  '# Level CRE Market Memory Bootstrap'
  ''
  "Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')"
  "Cutoff: $($cutoff.ToString('yyyy-MM-dd'))"
  ''
  'This is a read-only candidate report. It did not read email bodies and did not write to Level CRE.'
  ''
  '## Coverage'
  ''
  "- Outlook Sent metadata: $($outlookCounts.sent)"
  "- Outlook Inbox metadata: $($outlookCounts.inbox)"
  "- Recent selected files: $($fileRecords.Count)"
  "- Deal-signal evidence rows: $($signalRecords.Count)"
  "- Address-based opportunity candidates: $($candidateRows.Count)"
  ''
  'Outlook coverage is limited to the messages available in the local desktop cache. The cutoff does not guarantee a complete one-year mailbox export.'
  ''
  '## Top Candidates'
  ''
  '| Address | Type | Confidence | Evidence | Last seen |'
  '| --- | --- | ---: | ---: | --- |'
  $topCandidates
  ''
  '## Warnings'
  ''
  $warningLines
  ''
  '## Outputs'
  ''
  "- Outlook metadata: $outlookPath"
  "- File metadata: $filePath"
  "- Deal signals: $signalPath"
  "- Opportunity candidates: $candidatePath"
)
$summary | Set-Content -LiteralPath $summaryPath -Encoding utf8

[pscustomobject]@{
  status = 'complete'
  output_directory = $runDirectory
  summary_path = $summaryPath
  outlook_sent = $outlookCounts.sent
  outlook_inbox = $outlookCounts.inbox
  files = $fileRecords.Count
  signals = $signalRecords.Count
  candidates = $candidateRows.Count
  warnings = $warnings.Count
} | ConvertTo-Json -Depth 4
