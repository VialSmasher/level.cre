param(
  [Parameter(Mandatory = $true)]
  [string]$SourcePath,

  [string]$ApiBaseUrl = $env:LEVELCRE_API_URL,

  [string]$AgentApiKey = $env:MARKET_RECORD_AGENT_API_KEY,

  [switch]$SaveToReview
)

$ErrorActionPreference = 'Stop'

$resolvedSource = (Resolve-Path -LiteralPath $SourcePath).Path
if ([System.IO.Path]::GetExtension($resolvedSource) -ne '.json') {
  throw 'Brokerage-memory enrichment input must be a JSON file.'
}

if ([string]::IsNullOrWhiteSpace($ApiBaseUrl)) {
  $ApiBaseUrl = 'https://levelcre-production.up.railway.app'
}
$ApiBaseUrl = $ApiBaseUrl.TrimEnd('/')

if ([string]::IsNullOrWhiteSpace($AgentApiKey)) {
  throw 'MARKET_RECORD_AGENT_API_KEY is not set. This bridge uses the scoped proposal credential and cannot approve records.'
}

$payload = Get-Content -LiteralPath $resolvedSource -Raw | ConvertFrom-Json
$request = @{
  sourceFileName = [System.IO.Path]::GetFileName($resolvedSource)
  payload = $payload
}
$headers = @{ 'X-LevelCRE-Market-Key' = $AgentApiKey }

$preview = Invoke-RestMethod `
  -Method Post `
  -Uri "$ApiBaseUrl/api/intel/brokerage-memory/preview" `
  -Headers $headers `
  -ContentType 'application/json' `
  -Body ($request | ConvertTo-Json -Depth 100 -Compress)

if (-not $SaveToReview) {
  [pscustomobject]@{
    Mode = 'read_only_preview'
    SourceHash = $preview.sourceHash
    Identities = $preview.summary.identities
    Anchors = $preview.summary.anchors
    Existing = $preview.summary.existing
    MarketMemory = $preview.summary.marketMemory
    NeedsReview = $preview.summary.review
  }
  return
}

$request.previewHash = $preview.sourceHash
$staged = Invoke-RestMethod `
  -Method Post `
  -Uri "$ApiBaseUrl/api/intel/brokerage-memory/imports" `
  -Headers $headers `
  -ContentType 'application/json' `
  -Body ($request | ConvertTo-Json -Depth 100 -Compress)

[pscustomobject]@{
  Mode = 'saved_to_review'
  ImportId = $staged.importId
  Duplicate = [bool]$staged.duplicate
  SourceHash = $staged.sourceHash
  Identities = $staged.summary.identities
  Anchors = $staged.summary.anchors
  Existing = $staged.summary.existing
  MarketMemory = $staged.summary.marketMemory
  NeedsReview = $staged.summary.review
  Pending = $staged.summary.pending
}
