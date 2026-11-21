param(
  [switch]$Register,
  [string]$BaseUrl = 'http://127.0.0.1:3001/api/v1',
  [string]$CsvPath = (Join-Path $PSScriptRoot '..\deliverables\sample-events.csv')
)
$ErrorActionPreference = 'Stop'
$BaseUrl = $BaseUrl.TrimEnd('/')
$rows = @(Import-Csv -LiteralPath $CsvPath)
if ($rows.Count -eq 0) { throw 'The sample CSV has no event rows.' }

try {
  $health = Invoke-RestMethod -Uri "$BaseUrl/health" -TimeoutSec 15
  if ($health.status -ne 'ok') { throw 'Unexpected health response.' }
} catch {
  throw "Atlas API health check failed at $BaseUrl/health. Start npm.cmd run api:atlas in another window and confirm the health check succeeds. $($_.Exception.Message)"
}

$credential = Get-Credential -UserName 'demo.studio' -Message 'Enter a studio account password. With -Register, choose a new password of at least 12 characters.'
if (-not $credential) { throw 'Studio credentials were not entered.' }
$authBody = @{
  username = $credential.UserName
  password = $credential.GetNetworkCredential().Password
}
$route = 'login'
if ($Register) {
  $route = 'register'
  $authBody.profile = @{ name = 'Demo Owner'; studioName = 'Demo Studio' }
}
$session = Invoke-RestMethod -Method Post -Uri "$BaseUrl/auth/$route" -ContentType 'application/json' -Body ($authBody | ConvertTo-Json -Depth 3)
$headers = @{ Authorization = "Bearer $($session.token)" }
$existing = Invoke-RestMethod -Uri "$BaseUrl/events" -Headers $headers
$seen = @{}
foreach ($event in $existing) {
  if ($null -ne $event) { $seen["$($event.title)|$($event.date)"] = $true }
}

$created = 0
$skipped = 0
foreach ($row in $rows) {
  $key = "$($row.title)|$($row.date)"
  if ($seen.ContainsKey($key)) {
    $skipped++
    continue
  }
  $body = @{
    title = $row.title
    date = $row.date
    location = $row.location
    attendees = [int]$row.attendees
    type = $row.type
    status = $row.status
    totalAmount = [decimal]$row.totalAmount
    advance = [decimal]$row.advance
    notes = $row.notes
  }
  Invoke-RestMethod -Method Post -Uri "$BaseUrl/events" -Headers $headers -ContentType 'application/json' -Body ($body | ConvertTo-Json -Compress) | Out-Null
  $seen[$key] = $true
  $created++
}
Write-Host "Imported $created events. Skipped $skipped matching events."
