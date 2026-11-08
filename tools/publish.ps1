# Публикует проект на GitHub: создаёт репозиторий, заливает код, ставит описание
# и теги, создаёт релиз v<версия> и прикрепляет файлы из release/.
#
#   powershell -ExecutionPolicy Bypass -File tools\publish.ps1 -User <ник> -Repo PFN
#
# Токен берётся из переменной GH_TOKEN или из файла .gh-token в корне проекта
# (он в .gitignore). Классический токен: права repo + workflow.
#
# -DryRun делает всё локально (git init / commit), но ничего не отправляет.

param(
    [Parameter(Mandatory = $true)][string]$User,
    [string]$Repo = "PFN",
    [string]$Visibility = "public",
    [string]$Token = "",
    [string]$CommitMessage = "",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
    # --- токен --------------------------------------------------------------
    if (-not $Token) { $Token = $env:GH_TOKEN }
    if (-not $Token -and (Test-Path ".gh-token")) {
        $Token = (Get-Content ".gh-token" -Raw).Trim()
    }
    if (-not $Token -and -not $DryRun) {
        throw "Нет токена. Положите его в .gh-token или задайте переменную GH_TOKEN."
    }

    $version = (Select-String -Path "backend\app\core\config.py" -Pattern 'APP_VERSION = "([^"]+)"').Matches[0].Groups[1].Value
    $tag = "v$version"
    Write-Host "PFN $version -> github.com/$User/$Repo" -ForegroundColor Cyan

    # --- 1. ссылки в текстах -----------------------------------------------
    # В документации стоят заглушки USER/PFN, чтобы сайт и README не врали о
    # адресе репозитория. Меняем их на настоящие до коммита.
    $files = @("README.md", "NOTICE.md", "CHANGELOG.md") +
        (Get-ChildItem "site" -Filter *.md | ForEach-Object { "site\" + $_.Name })
    $replaced = 0
    foreach ($f in $files) {
        if (-not (Test-Path $f)) { continue }
        $text = Get-Content $f -Raw -Encoding UTF8
        if ($text -match "USER/PFN") {
            $text = $text -replace "USER/PFN", "$User/$Repo"
            [System.IO.File]::WriteAllText((Resolve-Path $f), $text, (New-Object System.Text.UTF8Encoding($false)))
            $replaced++
        }
    }
    Write-Host "ссылок обновлено: $replaced файл(ов)" -ForegroundColor DarkGray

    # --- 2. git -------------------------------------------------------------
    $git = "git"
    if (-not (Get-Command $git -ErrorAction SilentlyContinue)) {
        $candidate = "C:\Program Files\Git\cmd\git.exe"
        if (Test-Path $candidate) { $git = $candidate } else { throw "git не найден" }
    }

    if (-not (Test-Path ".git")) {
        & $git init -b main | Out-Null
    }
    & $git -c user.name=$User -c user.email="$User@users.noreply.github.com" add -A
    $staged = (& $git diff --cached --name-only | Measure-Object).Count
    if ($staged -eq 0) {
        Write-Host "изменений нет, коммит не нужен" -ForegroundColor DarkGray
    }
    else {
        if (-not $CommitMessage) { $CommitMessage = "PFN $version" }
        & $git -c user.name=$User -c user.email="$User@users.noreply.github.com" commit -m $CommitMessage | Out-Null
        Write-Host "закоммичено файлов: $staged" -ForegroundColor DarkGray
    }

    if ($DryRun) {
        Write-Host "DryRun: git готов, отправка пропущена" -ForegroundColor Yellow
        & $git log --oneline -1
        return
    }

    # --- 3. репозиторий через API ------------------------------------------
    $headers = @{
        Authorization          = "Bearer $Token"
        Accept                 = "application/vnd.github+json"
        "X-GitHub-Api-Version" = "2022-11-28"
        "User-Agent"           = "PFN-publish"
    }
    $api = "https://api.github.com"

    $exists = $true
    try { Invoke-RestMethod "$api/repos/$User/$Repo" -Headers $headers | Out-Null }
    catch { $exists = $false }

    if (-not $exists) {
        $body = @{
            name        = $Repo
            description = "Локальный трекер личных финансов: денежный поток, капитал, бюджеты, цели и активы. Один файл данных, установщик для Windows, без Docker и облака."
            private     = ($Visibility -ne "public")
            has_issues  = $true
            has_wiki    = $false
        } | ConvertTo-Json
        Invoke-RestMethod "$api/user/repos" -Method Post -Headers $headers -Body $body -ContentType "application/json" | Out-Null
        Write-Host "репозиторий создан" -ForegroundColor Green
    }
    else {
        Write-Host "репозиторий уже существует, обновляю" -ForegroundColor DarkGray
    }

    $topics = @{
        names = @("personal-finance", "finance-tracker", "budgeting", "sqlite", "fastapi",
            "react", "self-hosted", "desktop-app", "windows", "python", "typescript", "fork")
    } | ConvertTo-Json
    try {
        Invoke-RestMethod "$api/repos/$User/$Repo/topics" -Method Put -Headers $headers -Body $topics -ContentType "application/json" | Out-Null
    }
    catch { Write-Warning "не удалось выставить topics: $($_.Exception.Message)" }

    # --- 4. push ------------------------------------------------------------
    $remote = "https://x-access-token:$Token@github.com/$User/$Repo.git"
    & $git remote remove origin 2>$null
    & $git remote add origin $remote
    & $git push -u origin main
    if ($LASTEXITCODE -ne 0) { throw "git push завершился с кодом $LASTEXITCODE" }

    # Токен не должен остаться в конфиге репозитория.
    & $git remote set-url origin "https://github.com/$User/$Repo.git"

    # --- 5. релиз -----------------------------------------------------------
    $assets = @()
    foreach ($name in @("PFN-$version-Setup.exe", "PFN-$version-win64.zip", "SHA256SUMS.txt")) {
        $path = Join-Path "release" $name
        if (Test-Path $path) { $assets += $path } else { Write-Warning "нет файла $path" }
    }

    $bodyPath = "docs\GITHUB-RELEASE-1.2.0.md"
    $body = if (Test-Path $bodyPath) { Get-Content $bodyPath -Raw -Encoding UTF8 } else { "PFN $version" }
    $body = $body -replace "USER/PFN", "$User/$Repo"

    $releaseBody = @{
        tag_name         = $tag
        target_commitish = "main"
        name             = "PFN $version"
        body             = $body
        draft            = $false
        prerelease       = $false
    } | ConvertTo-Json -Depth 5

    try {
        $release = Invoke-RestMethod "$api/repos/$User/$Repo/releases" -Method Post -Headers $headers -Body $releaseBody -ContentType "application/json"
        Write-Host "релиз $tag создан" -ForegroundColor Green
    }
    catch {
        Write-Warning "релиз не создан: $($_.Exception.Message)"
        $release = $null
    }

    if ($release) {
        foreach ($file in $assets) {
            $name = Split-Path $file -Leaf
            $uploadUrl = ($release.upload_url -replace "\{.*\}", "") + "?name=$name"
            $uploadHeaders = @{
                Authorization  = "Bearer $Token"
                "User-Agent"   = "PFN-publish"
                "Content-Type" = "application/octet-stream"
            }
            try {
                Invoke-RestMethod $uploadUrl -Method Post -Headers $uploadHeaders -InFile $file | Out-Null
                Write-Host "  прикреплён $name" -ForegroundColor Green
            }
            catch { Write-Warning "не удалось прикрепить $name`: $($_.Exception.Message)" }
        }
    }

    Write-Host ""
    Write-Host "готово: https://github.com/$User/$Repo" -ForegroundColor Green
    Write-Host "релиз:  https://github.com/$User/$Repo/releases/tag/$tag"
}
finally {
    Pop-Location
}
