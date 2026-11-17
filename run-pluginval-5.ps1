$ErrorActionPreference = 'Stop'
$exe = "D:\desarrollos\ABDSynths\ABDAxionikVS\build\pluginval-local\pluginval.exe"
if (-not (Test-Path $exe)) {
    Write-Error "pluginval.exe no encontrado en $exe"
}
$vst3Item = Get-ChildItem -Path build -Recurse -Filter ABDMCX0X.vst3 -Directory | Select-Object -First 1
if (-not $vst3Item) {
    Write-Host "ABDMCX0X.vst3 no encontrado en build. Compila primero el plugin con: cmake --build build --config Release"
    exit 1
}
$vst3 = $vst3Item.FullName
New-Item -ItemType Directory -Force -Path build/reports_s5 | Out-Null
& $exe --version
$a = @('--strictness-level','5','--skip-gui-tests','--output-dir','build/reports_s5','--validate',"`"$vst3`"")
$p = Start-Process -FilePath $exe -ArgumentList $a -NoNewWindow -Wait -PassThru
Write-Host "PLUGINVAL_EXIT=$($p.ExitCode)"
exit $p.ExitCode
