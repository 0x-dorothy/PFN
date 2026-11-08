# Устанавливает плагин PFN в указанный vault.
#
#   powershell -ExecutionPolicy Bypass -File install.ps1 -Vault "D:\Notes"
#
# Куда кладёт: <Vault>\.obsidian\plugins\pfn-finance\
# Откуда берёт: pfn-finance-<версия>.zip рядом со скриптом, либо готовые
# main.js / manifest.json / styles.css из этой же папки.

param(
    [Parameter(Mandatory = $true)][string]$Vault,
    [string]$Zip = ""
)

$ErrorActionPreference = "Stop"
$here = Split-Path $PSScriptRoot -Parent
$source = $PSScriptRoot

if (-not (Test-Path $Vault)) {
    throw "Папка vault не найдена: $Vault"
}
if (-not (Test-Path (Join-Path $Vault ".obsidian"))) {
    Write-Warning "В '$Vault' нет папки .obsidian — это точно корень vault? Продолжаю, папку создам."
}

$target = Join-Path $Vault ".obsidian\plugins\pfn-finance"
New-Item -ItemType Directory -Force -Path $target | Out-Null

if (-not $Zip) {
    $candidate = Get-ChildItem $source -Filter "pfn-finance-*.zip" | Sort-Object Name -Descending | Select-Object -First 1
    if ($candidate) { $Zip = $candidate.FullName }
}

if ($Zip) {
    if (-not (Test-Path $Zip)) { throw "Архив не найден: $Zip" }
    $temp = Join-Path $env:TEMP ("pfn-plugin-" + [guid]::NewGuid().ToString("N"))
    Expand-Archive -Path $Zip -DestinationPath $temp -Force
    Copy-Item (Join-Path $temp "*") $target -Recurse -Force
    Remove-Item $temp -Recurse -Force
    Write-Host "распакован $Zip" -ForegroundColor DarkGray
}
else {
    $files = @("main.js", "manifest.json", "styles.css")
    foreach ($file in $files) {
        $path = Join-Path $source $file
        if (-not (Test-Path $path)) { throw "Нет файла $file. Соберите плагин: npm run build" }
        Copy-Item $path $target -Force
    }
}

$installed = Get-ChildItem $target -File | Select-Object -ExpandProperty Name
Write-Host ""
Write-Host "Установлено в $target" -ForegroundColor Green
Write-Host ("файлы: " + ($installed -join ", "))
Write-Host ""
Write-Host "Дальше в Obsidian:" -ForegroundColor Cyan
Write-Host "  1. Настройки → Сторонние плагины"
Write-Host "  2. Если включён «Режим ограничения» — выключить"
Write-Host "  3. Нажать «Обновить» (или перезапустить Obsidian)"
Write-Host "  4. Включить «PFN — Finance»"
Write-Host "  5. Иконка кошелька на левой панели → дашборд"
