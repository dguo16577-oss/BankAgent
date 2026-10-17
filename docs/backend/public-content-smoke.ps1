param([string]$BaseUrl = 'http://localhost:18080')
$ErrorActionPreference = 'Stop'
$browser = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
function Send-Request([string]$Method,[string]$Path,$Body=$null,[int]$Expected=200) {
    [void]$browser.Headers.Remove('X-XSRF-TOKEN')
    $headers=@{}
    if($Method -eq 'POST'){$headers['X-XSRF-TOKEN']=$browser.Cookies.GetCookies([uri]$BaseUrl)['XSRF-TOKEN'].Value}
    $args=@{Uri="$BaseUrl$Path";Method=$Method;WebSession=$browser;Headers=$headers;SkipHttpErrorCheck=$true}
    if($null -ne $Body){$args.Body=$Body|ConvertTo-Json -Depth 10 -Compress;$args.ContentType='application/json'}
    $r=Invoke-WebRequest @args
    if([int]$r.StatusCode -ne $Expected){throw "$Method $Path expected $Expected, received $($r.StatusCode)"}
    Write-Host "$Method $Path -> $Expected"
    $r.Content|ConvertFrom-Json -DateKind String
}
$routes=@('/public/home','/public/navigation','/public/catalog','/public/catalog/everyday-account','/public/support/articles','/public/support/articles/lost-card','/public/rates','/public/offers','/public/search?q=card')
$anonymous=@{}
foreach($route in $routes){$anonymous[$route]=Send-Request GET $route}
if($browser.Cookies.GetCookies([uri]$BaseUrl).Count -ne 0){throw 'Public GET created a cookie'}
if($anonymous['/public/catalog'].items.Count -ne 21){throw 'Catalog count mismatch'}
if($anonymous['/public/support/articles'].items.Count -ne 15){throw 'Support count mismatch'}
if($anonymous['/public/offers'].items.Count -ne 2){throw 'Offer count mismatch'}
if($anonymous['/public/home'].insights.Count -ne 4){throw 'Insight count mismatch'}
if($anonymous['/public/rates'].source -ne 'DEMO_RATE' -or $anonymous['/public/rates'].items[0].value -ne '7.1000'){throw 'Rate provenance/precision mismatch'}
foreach($route in @('/public/catalog/unknown','/public/support/articles/unknown')) {
    $errorResponse=Send-Request GET $route -Expected 404
    if($errorResponse.code -ne 'PUBLIC_CONTENT_NOT_FOUND'){throw 'Unexpected public 404 code'}
}
$search=Send-Request GET '/public/search?q=card'
foreach($kind in @('CATALOG_ITEM','SUPPORT_ARTICLE','OFFER')){if($kind -notin $search.items.type){throw "Missing search type $kind"}}
if('/products/travel-credit-card' -notin $search.items.route){throw 'Search did not return product navigation'}
foreach($query in @('Alex','8821','23842','unknown-m21')) {
    if((Send-Request GET "/public/search?q=$query").items.Count -ne 0){throw 'Unexpected private/unknown search result'}
}
$null=Send-Request GET /customer/accounts -Expected 401
$null=Send-Request GET /customer/session -Expected 401
$null=Send-Request POST /customer/auth/login @{email='alex@aster.local';password='demo-password'}
$null=Send-Request GET /customer/session
$overview=Send-Request GET /customer/overview
$accounts=Send-Request GET /customer/accounts
foreach($route in $routes) {
    $authenticated=Send-Request GET $route
    if(($anonymous[$route]|ConvertTo-Json -Depth 50 -Compress) -ne ($authenticated|ConvertTo-Json -Depth 50 -Compress)){throw "Public identity-dependent content: $route"}
}
Write-Host "Customer read regression: accounts=$($accounts.accounts.Count), total=$($accounts.totalBalance.amount), portfolio=$($overview.wealth.total.amount)."
$null=Send-Request POST /customer/auth/logout
$null=Send-Request GET /customer/accounts -Expected 401
$null=Send-Request GET /public/home
Write-Host 'M21 real HTTP smoke passed: all 9 Public APIs; identical anonymous/authenticated content; Customer security retained; no financial mutation.'
