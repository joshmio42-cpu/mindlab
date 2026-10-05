$ErrorActionPreference = 'Stop'
function Invoke-Checked {
    param([string]$Program, [string[]]$NativeArgs)
    & $Program @NativeArgs
    if ($LASTEXITCODE -ne 0) { throw "$Program failed with exit code $LASTEXITCODE" }
}
$ProjectRoot = Split-Path -Parent $PSScriptRoot
