param([string]$BaseUrl = 'http://localhost:18080')
$ErrorActionPreference = 'Stop'
$browser = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
function Send-CardRequest([string]$Method, [string]$Path, $Body = $null, [string]$Key = '', [int]$Expected = 200) {
    $headers = @{}
    if ($Method -eq 'POST') {
        $token = $browser.Cookies.GetCookies([uri]$BaseUrl)['XSRF-TOKEN']
        if (-not $token) { throw 'CSRF bootstrap is required.' }
        $headers['X-XSRF-TOKEN'] = $token.Value
    }
    if ($Key) { $headers['Idempotency-Key'] = $Key }
    $args = @{Uri="$BaseUrl$Path"; Method=$Method; WebSession=$browser; Headers=$headers; SkipHttpErrorCheck=$true}
    if ($null -ne $Body) { $args.Body=$Body | ConvertTo-Json -Depth 10 -Compress; $args.ContentType='application/json' }
    $response = Invoke-WebRequest @args
    if ([int]$response.StatusCode -ne $Expected) { throw "$Method $Path expected $Expected, received $($response.StatusCode)" }
    Write-Host "$Method $Path -> $Expected"
    $response.Content | ConvertFrom-Json
}
$null = Send-CardRequest GET /customer/session -Expected 401
$null = Send-CardRequest POST /customer/auth/login @{email='alex@aster.local'; password='demo-password'}
$null = Send-CardRequest GET /customer/session
$list = Send-CardRequest GET /customer/cards
if ($list.items.Count -lt 2) { throw 'Expected Alex demo cards.' }
$card = Send-CardRequest GET /customer/cards/card_aster_debit
if ($card.status -ne 'ACTIVE') { throw 'Smoke requires an initially ACTIVE demo debit card; existing state was not reset.' }
$accountsBefore = Send-CardRequest GET /customer/accounts
$historyBefore = Send-CardRequest GET '/customer/transactions?cardId=card_aster_debit&limit=50'
$freeze = Send-CardRequest POST /customer/card-action-intents @{cardId='card_aster_debit';actionType='FREEZE'} -Expected 201
if ($freeze.authorizationRequirement -ne 'CONFIRMATION') { throw 'Freeze must be confirmation-only.' }
$review = Send-CardRequest GET "/customer/card-action-intents/$($freeze.id)"
if ($review.intentHash -ne $freeze.intentHash) { throw 'Stored review changed.' }
$key = 'm17_freeze_' + [guid]::NewGuid().ToString('N')
$receipt = Send-CardRequest POST /customer/card-actions @{intentId=$freeze.id;intentHash=$freeze.intentHash} $key
$null = Send-CardRequest GET "/customer/card-actions/$($receipt.id)"
$frozen = Send-CardRequest GET /customer/cards/card_aster_debit
if ($frozen.status -ne 'FROZEN') { throw 'Expected FROZEN.' }
$unfreeze = Send-CardRequest POST /customer/card-action-intents @{cardId='card_aster_debit';actionType='UNFREEZE'} -Expected 201
if ($unfreeze.authorizationRequirement -ne 'STEP_UP_AUTH') { throw 'Unfreeze must require step-up.' }
$challenge = Send-CardRequest POST /customer/auth/step-up-challenges @{resourceType='CARD_ACTION_INTENT';resourceId=$unfreeze.id;resourceHash=$unfreeze.intentHash}
$verified = Send-CardRequest POST "/customer/auth/step-up-challenges/$($challenge.id)/verify" @{code='246810'}
$key = 'm17_unfreeze_' + [guid]::NewGuid().ToString('N')
$execution = @{intentId=$unfreeze.id;intentHash=$unfreeze.intentHash;actionAuthorizationId=$verified.authorization.id}
$receipt = Send-CardRequest POST /customer/card-actions $execution $key
$replay = Send-CardRequest POST /customer/card-actions $execution $key
if ($receipt.id -ne $replay.id) { throw 'Idempotent replay returned a different receipt.' }
$null = Send-CardRequest GET "/customer/card-actions/$($receipt.id)"
$active = Send-CardRequest GET /customer/cards/card_aster_debit
if ($active.status -ne 'ACTIVE') { throw 'Expected ACTIVE.' }
$accountsAfter = Send-CardRequest GET /customer/accounts
$historyAfter = Send-CardRequest GET '/customer/transactions?cardId=card_aster_debit&limit=50'
if (($accountsBefore | ConvertTo-Json -Depth 30 -Compress) -ne ($accountsAfter | ConvertTo-Json -Depth 30 -Compress)) { throw 'Account state changed.' }
if (($historyBefore | ConvertTo-Json -Depth 30 -Compress) -ne ($historyAfter | ConvertTo-Json -Depth 30 -Compress)) { throw 'Historical transactions changed.' }
$session = Send-CardRequest GET /customer/session
if ($session.assuranceLevel -ne 'AAL1') { throw 'Session was globally elevated.' }
$null = Send-CardRequest POST /customer/auth/logout
Write-Host 'M17 smoke passed: ACTIVE -> FROZEN -> ACTIVE; step-up/replay passed; financial state unchanged.'
