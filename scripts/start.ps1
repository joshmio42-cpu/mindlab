param([int]$Port = 8100)
. (Join-Path $PSScriptRoot 'common.ps1')
Push-Location $ProjectRoot
try {
    if (-not (Test-Path '.venv\Scripts\python.exe')) { throw 'Run .\scripts\setup.ps1 first.' }
    if (-not (Test-Path 'frontend\dist\index.html')) { throw 'Build the dashboard with npm run build in frontend first.' }
    $SelectedPort = $null
    foreach ($CandidatePort in $Port..($Port + 20)) {
        $PortProbe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $CandidatePort)
        try { $PortProbe.Start(); $SelectedPort = $CandidatePort; break } catch {} finally { $PortProbe.Stop() }
    }
    if (-not $SelectedPort) { throw 'No free local port found in the requested range.' }
    New-Item -ItemType Directory -Path '.runtime' -Force | Out-Null
    Set-Content -LiteralPath '.runtime\last-port.txt' -Value $SelectedPort
    $env:PYDANTIC_AI_NO_BANNER = '1'
    Write-Host "MindLab Workbench: http://127.0.0.1:$SelectedPort"
    Write-Host 'Press Ctrl+C to stop. Interrupted runs remain inspectable after restart.'
    Invoke-Checked '.\.venv\Scripts\python.exe' @('-m', 'uvicorn', 'workbench.api:app', '--host', '127.0.0.1', '--port', "$SelectedPort", '--workers', '1')
} finally { Pop-Location }
