# Test network latency to signaling service
$url = "https://192-168-29-196.nip.io:8444/health"

Write-Host "Testing latency to signaling service..." -ForegroundColor Cyan
Write-Host ""

for ($i = 1; $i -le 10; $i++) {
    $start = Get-Date
    try {
        # PowerShell 5.1: Enable TLS 1.2 and ignore cert errors
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        [System.Net.ServicePointManager]::ServerCertificateValidationCallback = {$true}
        $response = Invoke-RestMethod -Uri $url -ErrorAction Stop
        $end = Get-Date
        $latency = ($end - $start).TotalMilliseconds
        
        $color = "Green"
        if ($latency -gt 150) { $color = "Red" }
        elseif ($latency -gt 50) { $color = "Yellow" }
        
        Write-Host "[$i] Latency: " -NoNewline
        Write-Host "$([math]::Round($latency, 1))ms" -ForegroundColor $color -NoNewline
        Write-Host " | Helper: $($response.helperReady)" -ForegroundColor $(if ($response.helperReady) { "Green" } else { "Red" })
    }
    catch {
        Write-Host "[$i] " -NoNewline
        Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    }
    Start-Sleep -Milliseconds 500
}

Write-Host ""
Write-Host "Recommendations:" -ForegroundColor Cyan
Write-Host "  - Latency < 50ms: Excellent (Green)"
Write-Host "  - Latency 50-150ms: Good (Yellow)"
Write-Host "  - Latency > 150ms: Poor (Red)"
Write-Host "  - Latency > 1000ms: Check network/firewall"
