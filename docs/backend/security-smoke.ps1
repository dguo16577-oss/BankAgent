param([string]$BaseUrl = 'http://localhost:18080')
$ErrorActionPreference = 'Stop'
$browser = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
function Request([string]$Method, [string]$Path, [string]$Body = '', [bool]$WithCsrf = $false, $Session = $browser) {
    $headers = @{}
    if ($WithCsrf) {
        $token = $Session.Cookies.GetCookies([uri]$BaseUrl)['XSRF-TOKEN']
        if (-not $token) { throw 'Bootstrap CSRF state first.' }
        $headers['X-XSRF-TOKEN'] = $token.Value
    }
    $args = @{Uri="$BaseUrl$Path"; Method=$Method; WebSession=$Session; Headers=$headers; SkipHttpErrorCheck=$true}
    if ($Body) { $args.Body=$Body; $args.ContentType='application/json' }
    Invoke-WebRequest @args
}
function Expect($Response, [int]$Status, [string]$Label) {
    if ([int]$Response.StatusCode -ne $Status) { throw "$Label expected $Status, received $($Response.StatusCode)" }
    Write-Output "$Label -> $Status"
}
Expect (Request GET /customer/session) 401 'Anonymous session / CSRF bootstrap'
Expect (Request POST /customer/auth/login '{"email":"alex@aster.local","password":"demo-password"}' $true) 200 'Login'
$sessionResponse = Request GET /customer/session
Expect $sessionResponse 200 'Authenticated session / fresh CSRF'
if (($sessionResponse.Content | ConvertFrom-Json).assuranceLevel -ne 'AAL1') { throw 'Expected AAL1' }
Expect (Request GET /customer/accounts) 200 'Accounts'
Expect (Request GET /customer/transactions) 200 'Transactions'
Expect (Request GET /customer/recipients) 200 'Recipients'
$intent = '{"sourceAccountId":"acc_current","recipientId":"recipient_zhang","amount":{"amount":"1.00","currency":"CNY"},"note":"M16 security smoke"}'
Expect (Request POST /customer/transfer-intents $intent $false) 403 'Transfer intent without CSRF'
Expect (Request POST /customer/transfer-intents $intent $true) 201 'Transfer intent with CSRF'
$old = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
$cookie = $browser.Cookies.GetCookies([uri]$BaseUrl)['SESSION']
$old.Cookies.Add([uri]$BaseUrl, [System.Net.Cookie]::new('SESSION', $cookie.Value, '/'))
Expect (Request POST /customer/auth/logout '' $true) 200 'Logout'
Expect (Request GET /customer/accounts '' $false $old) 401 'Old cookie rejected'
Write-Output 'M16 smoke passed. No transfer was executed; no secrets printed.'
