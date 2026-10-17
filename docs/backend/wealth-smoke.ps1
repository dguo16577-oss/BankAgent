param([string]$BaseUrl = 'http://localhost:18080')
$ErrorActionPreference = 'Stop'
$browser = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
function Send-Request([string]$Method, [string]$Path, $Body = $null, [string]$Key = '', [int]$Expected = 200, [switch]$WithoutCsrf) {
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
$null = Send-Request GET /customer/wealth/portfolio -Expected 401
$null = Send-Request POST /customer/auth/login @{email='alex@aster.local';password='demo-password'}
$null = Send-Request GET /customer/session
$products = Send-Request GET /customer/wealth/products
if($products.items.Count -ne 4){throw 'Expected four products'}
$filtered = Send-Request GET '/customer/wealth/products?type=BOND_FUND&riskLevel=R2'
if($filtered.items.Count -ne 1){throw 'Product filter mismatch'}
$null = Send-Request GET /customer/wealth/products/product_bond
$risk = Send-Request GET /customer/wealth/risk-profile
if($risk.riskLevel -ne 'R2'){throw 'Expected R2'}
$account = Send-Request GET /customer/accounts/acc_current
$portfolio = Send-Request GET /customer/wealth/portfolio
if($account.balance.amount -ne '23842.31' -or $account.availableBalance.amount -ne '23810.31' -or $portfolio.totalValue.amount -ne '18320.00'){throw 'Smoke requires fresh initial fixture; persistent state was NOT reset.'}
$query = '/customer/spending/summary?from=2026-09-01T00:00:00%2B08:00&to=2026-09-27T10:30:00%2B08:00&compareFrom=2026-08-01T00:00:00%2B08:00&compareTo=2026-08-27T10:30:00%2B08:00'
$before = Send-Request GET $query
if($before.totalSpend.amount -ne '4968.00'){throw 'Spending initial fixture mismatch'}
$bad = Send-Request POST /customer/wealth/suitability-checks @{productId='product_balanced'} -Expected 201
if($bad.result -ne 'NOT_SUITABLE'){throw 'R2/R3 must be unsuitable'}
$badRequest = @{productId='product_balanced';sourceAccountId='acc_current';amount=@{amount='1000.00';currency='CNY'};suitabilityCheckId=$bad.id}
$badError = Send-Request POST /customer/investment-order-intents $badRequest -Expected 422
if($badError.code -ne 'PRODUCT_NOT_SUITABLE'){throw 'Unsuitable purchase must be rejected'}
$null = Send-Request POST /customer/wealth/suitability-checks @{productId='product_bond'} -Expected 403 -WithoutCsrf
$check = Send-Request POST /customer/wealth/suitability-checks @{productId='product_bond'} -Expected 201
if($check.result -ne 'SUITABLE'){throw 'Expected R2/R2 suitability'}
$null = Send-Request GET "/customer/wealth/suitability-checks/$($check.id)"
$request = @{productId='product_bond';sourceAccountId='acc_current';amount=@{amount='1000.00';currency='CNY'};suitabilityCheckId=$check.id}
$null = Send-Request POST /customer/investment-order-intents $request -Expected 403 -WithoutCsrf
$intent = Send-Request POST /customer/investment-order-intents $request -Expected 201
if($intent.authorizationRequirement -ne 'CONFIRMATION'){throw 'Unexpected authorization requirement'}
$null = Send-Request GET "/customer/investment-order-intents/$($intent.id)"
$execution = @{intentId=$intent.id;intentHash=$intent.intentHash}
$key = 'm19_invest_' + [guid]::NewGuid().ToString('N')
$null = Send-Request POST /customer/investment-orders $execution $key -Expected 403 -WithoutCsrf
$receipt = Send-Request POST /customer/investment-orders $execution $key
$null = Send-Request GET "/customer/investment-orders/$($receipt.id)"
$afterAccount = Send-Request GET /customer/accounts/acc_current
$afterPortfolio = Send-Request GET /customer/wealth/portfolio
if($afterAccount.balance.amount -ne '22842.31' -or $afterAccount.pendingAmount.amount -ne '32.00' -or $afterAccount.availableBalance.amount -ne '22810.31'){throw 'Debit invariant failed'}
if($afterPortfolio.totalValue.amount -ne '19320.00' -or $afterPortfolio.gainLoss.amount -ne '220.00' -or $afterPortfolio.monthlyChangePercent -ne '1.22'){throw 'Portfolio invariant failed'}
$tx = Send-Request GET "/customer/transactions/$($receipt.transactionId)"
if($tx.amount.amount -ne '1000.00' -or $tx.type -ne 'INVESTMENT_PURCHASE' -or $tx.category -ne 'INVESTMENT' -or $tx.direction -ne 'DEBIT'){throw 'Investment transaction mismatch'}
$history = Send-Request GET '/customer/transactions?type=INVESTMENT_PURCHASE&limit=50'
if($history.items.Count -ne 1){throw 'Expected one investment transaction'}
$after = Send-Request GET $query
$before.PSObject.Properties.Remove('asOf')
$after.PSObject.Properties.Remove('asOf')
if(($before|ConvertTo-Json -Depth 30 -Compress) -ne ($after|ConvertTo-Json -Depth 30 -Compress)){throw 'Spending changed'}
$replay = Send-Request POST /customer/investment-orders $execution $key
if(($receipt|ConvertTo-Json -Depth 30 -Compress) -ne ($replay|ConvertTo-Json -Depth 30 -Compress)){throw 'Replay mismatch'}
$replayAccount=Send-Request GET /customer/accounts/acc_current
$replayPortfolio=Send-Request GET /customer/wealth/portfolio
if(($afterAccount|ConvertTo-Json -Depth 30 -Compress) -ne ($replayAccount|ConvertTo-Json -Depth 30 -Compress) -or ($afterPortfolio|ConvertTo-Json -Depth 30 -Compress) -ne ($replayPortfolio|ConvertTo-Json -Depth 30 -Compress)){throw 'Replay changed financial state'}
$history=Send-Request GET '/customer/transactions?type=INVESTMENT_PURCHASE&limit=50'
if($history.items.Count -ne 1){throw 'Replay duplicated transaction'}
$null = Send-Request POST /customer/auth/logout
$null = Send-Request GET /customer/wealth/portfolio -Expected 401
Write-Host "M19 smoke passed. Order: $($receipt.id); transaction: $($receipt.transactionId)"
Write-Host 'Account 23842.31 -> 22842.31; available 23810.31 -> 22810.31; pending 32.00; portfolio 18320.00 -> 19320.00; gain 220.00; spending 4968.00 unchanged.'
Write-Host 'Persistent demo state has been mutated; no reset was performed.'

