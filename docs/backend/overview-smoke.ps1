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
    # Preserve contract ISO strings; PowerShell 7.5+ otherwise converts timestamps into DateTime.
    $r.Content|ConvertFrom-Json -DateKind String
}
function Equal($left,$right,[string]$name) {
    if(($left|ConvertTo-Json -Depth 40 -Compress) -ne ($right|ConvertTo-Json -Depth 40 -Compress)){throw "$name parity failed"}
}
$null=Send-Request GET /customer/overview -Expected 401
$null=Send-Request GET /customer/session -Expected 401
$null=Send-Request POST /customer/auth/login @{email='alex@aster.local';password='demo-password'}
$null=Send-Request GET /customer/session
$v=Send-Request GET /customer/overview
$a=Send-Request GET /customer/accounts
$c=Send-Request GET /customer/cards
$p=Send-Request GET /customer/wealth/portfolio
$t=Send-Request GET '/customer/transactions?limit=5'
$r=Send-Request GET /customer/recurring-payments
Equal $v.accounts $a.accounts 'Accounts'
Equal $v.totalBalance $a.totalBalance 'Total balance'
Equal $v.exchangeEquivalents $a.exchangeEquivalents 'FX provenance'
Equal $v.cards $c.items 'Cards'
Equal $v.recentTransactions $t.items 'Recent transactions'
Equal $v.wealth.total $p.totalValue 'Portfolio total'
Equal $v.wealth.monthlyChange $p.monthlyChange 'Monthly change'
Equal $v.wealth.monthlyChangePercent $p.monthlyChangePercent 'Monthly percentage'
$holdings=@($p.positions|ForEach-Object { [ordered]@{id=$_.id;name=$_.displayName;value=$_.currentValue} })
Equal $v.wealth.holdings $holdings 'Holdings'
$query='/customer/spending/summary?from='+[uri]::EscapeDataString($v.spending.currentPeriod.periodStart)+'&to='+[uri]::EscapeDataString($v.spending.currentPeriod.periodEnd)+'&compareFrom='+[uri]::EscapeDataString($v.spending.comparisonPeriod.periodStart)+'&compareTo='+[uri]::EscapeDataString($v.spending.comparisonPeriod.periodEnd)
$spend=Send-Request GET $query
Equal $v.spending.currentPeriod.amount $spend.totalSpend 'Current spending'
Equal $v.spending.comparisonPeriod.amount $spend.comparisonTotalSpend 'Comparison spending'
Equal $v.spending.changePercent $spend.percentageChange 'Spending comparison'
if($v.spending.currentPeriod.periodStart.StartsWith('2026-09') -and $spend.totalSpend.amount -ne '4968.00'){throw 'September fixture spending mismatch'}
$expected=@($r.items|Where-Object {$_.status -eq 'ACTIVE' -and $_.source -eq 'BANK_MANAGED' -and $_.nextExpectedAt -and [datetimeoffset]$_.nextExpectedAt -gt [datetimeoffset]$v.asOf}|Sort-Object @{Expression={[datetimeoffset]$_.nextExpectedAt}},id|Select-Object -First 4)
Equal @($v.upcomingPayments|ForEach-Object {$_.id}) @($expected|ForEach-Object {$_.id}) 'Upcoming IDs/order'
foreach($payment in $v.upcomingPayments){
    $source=$expected|Where-Object id -EQ $payment.id
    Equal $payment.amount $source.usualAmount 'Upcoming amount'
    if($payment.title -ne $source.displayName -or [datetimeoffset]$payment.dueAt -ne [datetimeoffset]$source.nextExpectedAt -or $payment.type -ne 'RECURRING'){throw 'Upcoming projection mismatch'}
}
if($v.accounts.Count -eq 0 -or $v.cards.Count -eq 0){throw 'Expected local Alex accounts and cards'}
Write-Host "M20 parity passed: totalBalance=$($v.totalBalance.amount), spending=$($spend.totalSpend.amount), portfolio=$($p.totalValue.amount), accounts=$($v.accounts.Count), cards=$($v.cards.Count), upcoming=$($v.upcomingPayments.Count)."
Write-Host ('Current persistent card states: '+(($c.items|ForEach-Object {"$($_.id)=$($_.status)"}) -join ', '))
Write-Host ('Current persistent recurring states: '+(($r.items|ForEach-Object {"$($_.id)=$($_.status)"}) -join ', '))
$null=Send-Request POST /customer/auth/logout
$null=Send-Request GET /customer/overview -Expected 401
Write-Host 'M20 smoke completed without a financial mutation or fixture reset.'

