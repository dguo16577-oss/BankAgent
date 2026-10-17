param([string]$BaseUrl = 'http://localhost:18080')
$ErrorActionPreference = 'Stop'
$browser = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
function Send-Request([string]$Method, [string]$Path, $Body = $null, [string]$Key = '', [int]$Expected = 200, [switch]$WithoutCsrf) {
    # PowerShell retains supplied headers on WebRequestSession; remove them before each request.
    [void]$browser.Headers.Remove('X-XSRF-TOKEN')
    [void]$browser.Headers.Remove('Idempotency-Key')
    $headers = @{}
    if ($Method -eq 'POST' -and -not $WithoutCsrf) {
        $token = $browser.Cookies.GetCookies([uri]$BaseUrl)['XSRF-TOKEN']
        if (-not $token) { throw 'CSRF bootstrap is required.' }
        $headers['X-XSRF-TOKEN'] = $token.Value
    }
    if ($Key) { $headers['Idempotency-Key'] = $Key }
    $requestArgs = @{Uri="$BaseUrl$Path"; Method=$Method; WebSession=$browser; Headers=$headers; SkipHttpErrorCheck=$true}
    if ($null -ne $Body) { $requestArgs.Body=$Body | ConvertTo-Json -Depth 10 -Compress; $requestArgs.ContentType='application/json' }
    $response = Invoke-WebRequest @requestArgs
    if ([int]$response.StatusCode -ne $Expected) { throw "$Method $Path expected $Expected, received $($response.StatusCode)" }
    Write-Host "$Method $Path -> $Expected"
    $response.Content | ConvertFrom-Json
}
$null = Send-Request GET /customer/session -Expected 401
$null = Send-Request GET /customer/spending/summary -Expected 401
$null = Send-Request GET /customer/recurring-payments -Expected 401
$null = Send-Request POST /customer/auth/login @{email='alex@aster.local'; password='demo-password'}
$null = Send-Request GET /customer/session
$query = '/customer/spending/summary?from=2026-09-01T00:00:00%2B08:00&to=2026-09-27T10:30:00%2B08:00&compareFrom=2026-08-01T00:00:00%2B08:00&compareTo=2026-08-27T10:30:00%2B08:00'
$before = Send-Request GET $query
if ($before.totalSpend.amount -ne '4968.00' -or $before.comparisonTotalSpend.amount -ne '4800.00' -or $before.percentageChange -ne '3.50') { throw 'Standard spending fixture mismatch.' }
$list = Send-Request GET /customer/recurring-payments
if ($list.items.Count -ne 6) { throw 'Expected six recurring fixtures.' }
$payment = Send-Request GET /customer/recurring-payments/rec_netflix
if ($payment.status -ne 'ACTIVE') { throw 'Smoke requires initially ACTIVE Netflix. Existing state was not reset.' }
$accounts = Send-Request GET /customer/accounts
$cards = Send-Request GET /customer/cards
$history = Send-Request GET '/customer/transactions?accountId=acc_current&limit=50'
$book = Send-Request GET /customer/recurring-payments/rec_bookshop
if ($book.detectionProvenance.observedOccurrences -ne 3 -or $book.managementCapability -ne 'NONE') { throw 'Bookshop provenance mismatch.' }
$null = Send-Request POST /customer/recurring-payment-action-intents @{recurringPaymentId='rec_bookshop';actionType='STOP_FUTURE_PAYMENTS'} -Expected 422
$prepare = @{recurringPaymentId='rec_netflix';actionType='STOP_FUTURE_PAYMENTS'}
$null = Send-Request POST /customer/recurring-payment-action-intents $prepare -Expected 403 -WithoutCsrf
$intent = Send-Request POST /customer/recurring-payment-action-intents $prepare -Expected 201
if ($intent.authorizationRequirement -ne 'CONFIRMATION') { throw 'Stop must not require step-up.' }
$null = Send-Request GET "/customer/recurring-payment-action-intents/$($intent.id)"
$execution = @{intentId=$intent.id;intentHash=$intent.intentHash}
$key = 'm18_stop_' + [guid]::NewGuid().ToString('N')
$null = Send-Request POST /customer/recurring-payment-actions $execution $key -Expected 403 -WithoutCsrf
$receipt = Send-Request POST /customer/recurring-payment-actions $execution $key
$null = Send-Request GET "/customer/recurring-payment-actions/$($receipt.id)"
$stopped = Send-Request GET /customer/recurring-payments/rec_netflix
if ($stopped.status -ne 'STOPPED' -or $null -ne $stopped.nextExpectedAt) { throw 'Expected STOPPED / null nextExpectedAt.' }
if (($payment.transactionHistory | ConvertTo-Json -Compress) -ne ($stopped.transactionHistory | ConvertTo-Json -Compress) -or $payment.lastPaidAt -ne $stopped.lastPaidAt) { throw 'Historical recurring state changed.' }
$after = Send-Request GET $query
# Clock-derived asOf advances; the explicit reporting windows and all aggregates must remain identical.
$before.PSObject.Properties.Remove('asOf')
$after.PSObject.Properties.Remove('asOf')
if (($before | ConvertTo-Json -Depth 30 -Compress) -ne ($after | ConvertTo-Json -Depth 30 -Compress)) { throw 'Historical analytics changed.' }
$accountsAfter = Send-Request GET /customer/accounts
$cardsAfter = Send-Request GET /customer/cards
$historyAfter = Send-Request GET '/customer/transactions?accountId=acc_current&limit=50'
foreach ($pair in @(@($accounts,$accountsAfter),@($cards,$cardsAfter),@($history,$historyAfter))) {
    if (($pair[0] | ConvertTo-Json -Depth 30 -Compress) -ne ($pair[1] | ConvertTo-Json -Depth 30 -Compress)) { throw 'Financial state changed.' }
}
$replay = Send-Request POST /customer/recurring-payment-actions $execution $key
if (($receipt | ConvertTo-Json -Depth 30 -Compress) -ne ($replay | ConvertTo-Json -Depth 30 -Compress)) { throw 'Replay must return original receipt.' }
$null = Send-Request POST /customer/auth/logout
$null = Send-Request GET /customer/recurring-payments -Expected 401
Write-Host 'M18 smoke passed: 4968.00 / 4800.00 / 3.50; Netflix STOPPED; historical activity unchanged; CSRF and replay passed; no step-up requested.'

