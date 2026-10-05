. (Join-Path $PSScriptRoot 'common.ps1')
Push-Location $ProjectRoot
try {
    $env:PYDANTIC_AI_NO_BANNER = '1'
    Invoke-Checked '.\.tools\Scripts\uv.exe' @('pip', 'check', '--python', '.venv/Scripts/python.exe', '--cache-dir', '.cache/uv')
    Invoke-Checked '.\.venv\Scripts\ruff.exe' @('check', 'backend', 'scripts')
    Invoke-Checked '.\.venv\Scripts\ruff.exe' @('format', '--check', 'backend', 'scripts')
    New-Item -ItemType Directory -Path '.runtime' -Force | Out-Null
    $TestDirectory = '.runtime/pytest-' + [Guid]::NewGuid().ToString('N')
    Invoke-Checked '.\.venv\Scripts\python.exe' @('-m', 'pytest', '-q', '--basetemp', $TestDirectory)
    Invoke-Checked '.\.venv\Scripts\python.exe' @('scripts/export_contract.py', '--check')
    $ContractPath = Join-Path $ProjectRoot 'frontend\src\schema.ts'
    $BeforeContractHash = (Get-FileHash -LiteralPath $ContractPath).Hash
    Push-Location frontend
    try {
        Invoke-Checked 'npm.cmd' @('run', 'contracts')
        if ((Get-FileHash -LiteralPath $ContractPath).Hash -ne $BeforeContractHash) { throw 'Generated TypeScript contract changed; inspect and retain it before rerunning checks.' }
        Invoke-Checked 'npm.cmd' @('run', 'lint')
        Invoke-Checked 'npm.cmd' @('run', 'format:check')
        Invoke-Checked 'npm.cmd' @('run', 'test')
        Invoke-Checked 'npm.cmd' @('run', 'build')
        Invoke-Checked 'npm.cmd' @('run', 'e2e')
    } finally { Pop-Location }
    Write-Host 'All checks passed. No real model calls were made.'
} finally { Pop-Location }
