# Собирает Windows-поставку целиком:
#   dist\PFN\PFN.exe            — приложение
#   release\PFN-<ver>-win64.zip — портативная версия
#   release\PFN-<ver>-Setup.exe — установщик (если найден Inno Setup)
#   release\SHA256SUMS.txt      — контрольные суммы
#
#   powershell -ExecutionPolicy Bypass -File tools\build_windows.ps1
#
# Нужны: Node.js 20+, Python 3.11+ c зависимостями из backend\requirements.txt
# и pyinstaller, Inno Setup 6 (для установщика). Пользователю ничего из этого
# не нужно — он скачивает готовый Setup.exe.

param(
    [string]$Python = "python",
    [string]$OutDir = "release"
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
    $version = (Select-String -Path "backend\app\core\config.py" -Pattern 'APP_VERSION = "([^"]+)"').Matches[0].Groups[1].Value
    Write-Host "PFN $version" -ForegroundColor Cyan

    # PyInstaller требует нормальный CPython. Сначала пробуем переносимый из
    # build\pytool — он чистый (без лишних пакетов) и даёт воспроизводимый
    # размер сборки; иначе — указанный $Python.
    $portable = "build\pytool\extracted\tools\python.exe"
    $py = $null
    if (Test-Path $portable) {
        $candidate = (Resolve-Path $portable).Path
        & $candidate -c "import PyInstaller, fastapi" *> $null
        if ($LASTEXITCODE -eq 0) { $py = $candidate }
    }
    if (-not $py) {
        & $Python -c "import PyInstaller, fastapi" *> $null
        if ($LASTEXITCODE -eq 0) { $py = $Python }
    }
    if (-not $py) {
        throw "Нет PyInstaller и fastapi. Установите: pip install -r backend\requirements.txt pyinstaller"
    }
    Write-Host "сборка через: $py" -ForegroundColor DarkGray

    Write-Host "1/5 Интерфейс..." -ForegroundColor Cyan
    Push-Location frontend
    npm install --no-audit --no-fund
    npm run build
    Pop-Location

    Write-Host "2/5 PFN.exe..." -ForegroundColor Cyan
    & $py -m PyInstaller pfn.spec --noconfirm --clean

    if (-not (Test-Path "dist\PFN\PFN.exe")) {
        throw "Сборка не дала dist\PFN\PFN.exe"
    }

    Write-Host "3/5 README, лицензия и архив..." -ForegroundColor Cyan
    # PolyForm Noncommercial's Notices clause: everyone who gets a copy of the
    # software must get the licence text and the Required Notice with it.
    Copy-Item "README.md" "dist\PFN\README.md" -Force
    Copy-Item "LICENSE" "dist\PFN\LICENSE" -Force
    Copy-Item "NOTICE.md" "dist\PFN\NOTICE.md" -Force
    Copy-Item "CHANGELOG.md" "dist\PFN\CHANGELOG.md" -Force
    New-Item -ItemType Directory -Force $OutDir | Out-Null
    $zip = Join-Path $OutDir "PFN-$version-win64.zip"
    if (Test-Path $zip) { Remove-Item $zip -Force }
    Compress-Archive -Path "dist\PFN\*" -DestinationPath $zip

    Write-Host "4/5 Установщик..." -ForegroundColor Cyan
    # $env:LOCALAPPDATA может быть пустым в урезанном окружении, поэтому путь
    # добавляется только если переменная задана.
    $isccCandidates = @(
        "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
        "C:\Program Files\Inno Setup 6\ISCC.exe"
    )
    if ($env:LOCALAPPDATA) {
        $isccCandidates += (Join-Path $env:LOCALAPPDATA "Programs\InnoSetup6\ISCC.exe")
    }
    $iscc = $isccCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

    if ($iscc) {
        & $iscc "installer\pfn.iss" "/DAppVersion=$version"
        if ($LASTEXITCODE -ne 0) { throw "ISCC завершился с кодом $LASTEXITCODE" }
    }
    else {
        Write-Warning "Inno Setup не найден — установщик не собран. Скачать: https://jrsoftware.org/isdl.php"
    }

    Write-Host "5/5 Контрольные суммы..." -ForegroundColor Cyan
    $sums = Join-Path $OutDir "SHA256SUMS.txt"
    $lines = Get-ChildItem $OutDir -File |
        Where-Object { $_.Name -ne "SHA256SUMS.txt" } |
        Sort-Object Name |
        ForEach-Object { "{0}  {1}" -f (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower(), $_.Name }
    $lines | Set-Content $sums -Encoding ascii

    Write-Host ""
    Write-Host "готово:" -ForegroundColor Green
    Get-ChildItem $OutDir -File | ForEach-Object {
        Write-Host ("  {0,-28} {1,8:N1} МБ" -f $_.Name, ($_.Length / 1MB))
    }
}
finally {
    Pop-Location
}
