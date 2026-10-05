param([string]$PythonPath = '')
. (Join-Path $PSScriptRoot 'common.ps1')
Push-Location $ProjectRoot
try {
    if (-not $PythonPath) {
        if (Get-Command py -ErrorAction SilentlyContinue) {
            $PythonPath = (& py -3.12 -c 'import sys; print(sys.executable)').Trim()
        } elseif (Get-Command python -ErrorAction SilentlyContinue) {
            $PythonPath = (Get-Command python).Source
        } else {
            throw 'Python 3.12 is required. Pass -PythonPath C:\path\to\python.exe.'
        }
    }
    Invoke-Checked $PythonPath @('-c', 'import sys; assert sys.version_info[:2] == (3,12), "Python 3.12 required"')
    Invoke-Checked 'node' @('-e', 'if(Number(process.versions.node.split(".")[0])<22)process.exit(1)')
    if (-not (Test-Path '.tools\Scripts\uv.exe')) {
        Invoke-Checked $PythonPath @('-m', 'venv', '.tools')
        Invoke-Checked '.\.tools\Scripts\python.exe' @('-m', 'pip', 'install', '--disable-pip-version-check', 'uv==0.12.22')
    }
    Invoke-Checked '.\.tools\Scripts\uv.exe' @('sync', '--locked', '--python', $PythonPath, '--cache-dir', '.cache/uv')
    Invoke-Checked '.\.tools\Scripts\uv.exe' @('pip', 'check', '--python', '.venv/Scripts/python.exe', '--cache-dir', '.cache/uv')
    Push-Location frontend
    try {
        Invoke-Checked 'npm.cmd' @('ci', '--cache', '.cache/npm')
        Invoke-Checked 'npx.cmd' @('playwright', 'install', 'chromium')
        Invoke-Checked 'npm.cmd' @('run', 'build')
    } finally { Pop-Location }
    Write-Host 'Setup complete. Start with .\scripts\start.ps1'
} finally { Pop-Location }
