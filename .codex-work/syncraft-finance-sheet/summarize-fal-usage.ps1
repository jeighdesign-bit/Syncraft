$ErrorActionPreference = 'Stop'

$envFile = Get-ChildItem -Path . -Force -File | Where-Object { $_.Name -in @('.env.local', '.env') } | Select-Object -First 1
if (-not $envFile) { throw 'No .env.local or .env found' }
$falLine = Get-Content -LiteralPath $envFile.FullName | Where-Object { $_ -match '^FAL_KEY=' } | Select-Object -First 1
if (-not $falLine) { throw 'FAL_KEY not found' }
$falKey = ($falLine -replace '^FAL_KEY=', '').Trim('"').Trim("'")
$headers = @{ Authorization = "Key $falKey" }
$endpoints = @(
  'fal-ai/nano-banana-pro/edit',
  'fal-ai/esrgan',
  'fal-ai/clarity-upscaler',
  'fal-ai/birefnet'
)
$start = (Get-Date).ToUniversalTime().AddDays(-30).ToString('yyyy-MM-ddTHH:mm:ssZ')
$finish = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')

foreach ($endpoint in $endpoints) {
  $encoded = [uri]::EscapeDataString($endpoint)
  try {
    $pricingUri = "https://api.fal.ai/v1/models/pricing?endpoint_id=$encoded"
    $pricing = Invoke-RestMethod -Headers $headers -Uri $pricingUri -Method Get
    [ordered]@{ endpoint=$endpoint; pricing=$pricing } | ConvertTo-Json -Compress -Depth 8
  } catch {
    [ordered]@{ endpoint=$endpoint; pricing_error=$_.Exception.Message } | ConvertTo-Json -Compress
  }
  try {
    $items = @()
    $cursor = $null
    $hasMore = $true
    while ($hasMore -and $items.Count -lt 5000) {
      $uri = "https://api.fal.ai/v1/models/requests/by-endpoint?endpoint_id=$encoded&start=$start&end=$finish&limit=100&expand=payloads"
      if ($cursor) { $uri += "&cursor=$([uri]::EscapeDataString([string]$cursor))" }
      $response = Invoke-RestMethod -Headers $headers -Uri $uri -Method Get
      $items += @($response.items)
      $hasMore = [bool]$response.has_more
      $cursor = $response.next_cursor
      if ($hasMore -and -not $cursor) { break }
    }
    $successfulItems = @($items | Where-Object { [int]$_.status_code -ge 200 -and [int]$_.status_code -lt 300 })
    $durations = @($successfulItems | ForEach-Object { [double]$_.duration })
    $outputMegapixels = @($successfulItems | ForEach-Object {
      $img = $_.json_output.image
      if (-not $img -and $_.json_output.images) { $img = @($_.json_output.images)[0] }
      if ($img.width -and $img.height) { ([double]$img.width * [double]$img.height) / 1000000 }
    })
    $success = @($items | Where-Object { [int]$_.status_code -ge 200 -and [int]$_.status_code -lt 300 }).Count
    $failed = @($items | Where-Object { [int]$_.status_code -ge 400 }).Count
    $summary = [ordered]@{
      endpoint = $endpoint
      count = $items.Count
      success = $success
      failed = $failed
      item_fields = if ($items.Count) { @($items[0].PSObject.Properties.Name) } else { @() }
      duration_samples = @($items | Select-Object -First 3 | ForEach-Object { $_.duration })
      status_codes = @($items | Group-Object status_code | ForEach-Object { [ordered]@{ code=$_.Name; count=$_.Count } })
      input_keys = if ($items.Count -and $items[0].json_input) { @($items[0].json_input.PSObject.Properties.Name) } else { @() }
      output_keys = if ($items.Count -and $items[0].json_output) { @($items[0].json_output.PSObject.Properties.Name) } else { @() }
      average_duration = if ($durations.Count) { [math]::Round(($durations | Measure-Object -Average).Average, 4) } else { $null }
      min_duration = if ($durations.Count) { [math]::Round(($durations | Measure-Object -Minimum).Minimum, 4) } else { $null }
      max_duration = if ($durations.Count) { [math]::Round(($durations | Measure-Object -Maximum).Maximum, 4) } else { $null }
      average_output_megapixels = if ($outputMegapixels.Count) { [math]::Round(($outputMegapixels | Measure-Object -Average).Average, 4) } else { $null }
      max_output_megapixels = if ($outputMegapixels.Count) { [math]::Round(($outputMegapixels | Measure-Object -Maximum).Maximum, 4) } else { $null }
      has_more = $hasMore
    }
    $summary | ConvertTo-Json -Compress -Depth 5
  } catch {
    [ordered]@{ endpoint=$endpoint; error=$_.Exception.Message } | ConvertTo-Json -Compress
  }
}
