param(
    [switch]$NoPause
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

$verFile = Join-Path $RootDir 'VERSION'
$version = if (Test-Path -LiteralPath $verFile) { (Get-Content -LiteralPath $verFile -Raw).Trim() } else { '2.1.0' }
$Stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$DistBase = Join-Path $RootDir 'dist_update'
if (-not (Test-Path -LiteralPath $DistBase)) {
    New-Item -ItemType Directory -Path $DistBase -Force | Out-Null
}

# Clean old update packages in dist_update so only latest remains
Get-ChildItem -LiteralPath $DistBase -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.Name -like '电子宠物积分系统_升级包_*') {
        Remove-Item -LiteralPath $_.FullName -Recurse -Force
    }
}

$PackName = "电子宠物积分系统_升级包_v${version}_$Stamp"
$PackDir = Join-Path $DistBase $PackName
$ZipPath = Join-Path $DistBase "$PackName.zip"

Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host "     电子宠物积分系统 v${version} - 生成服务器一键升级包工具        " -ForegroundColor Green
Write-Host '=================================================================' -ForegroundColor Cyan

New-Item -ItemType Directory -Path $PackDir -Force | Out-Null

# Explicitly copy ONLY program folders (never data/, logs/, backups/, dist_update/, .git/)
foreach ($sub in @('src', 'scripts', 'node_modules')) {
    $srcSub = Join-Path $RootDir $sub
    $dstSub = Join-Path $PackDir $sub
    if (Test-Path -LiteralPath $srcSub) {
        $null = robocopy $srcSub $dstSub /MIR /NFL /NDL /NJH /NJS /NC /NS
        if ($LASTEXITCODE -ge 8) { throw "复制目录 $sub 失败" }
    }
}

$rootFiles = @(
    'package.json', 'package-lock.json', 'index.html', 'VERSION',
    '电子宠物入口.html', '教师大屏入口.html', '查看与管理后台服务.bat',
    '一键安装并启动保活服务.bat', '一键启动电子宠物积分系统.exe',
    '一键升级部署.bat', '一键升级部署.exe',
    '打开学生端.bat', '打开教师大屏.bat', '启动v2新版.bat', '停止服务.bat',
    'start_silent.vbs', 'start_console.bat', '使用说明.txt'
)
foreach ($rf in $rootFiles) {
    $srcFile = Join-Path $RootDir $rf
    if (Test-Path -LiteralPath $srcFile) {
        Copy-Item -LiteralPath $srcFile -Destination (Join-Path $PackDir $rf) -Force
    }
}

# Safety verification: ensure no data/ directory exists inside PackDir
if (Test-Path -LiteralPath (Join-Path $PackDir 'data')) {
    throw '安全校验失败：升级包中不允许包含 data 目录！'
}

if (Test-Path -LiteralPath $ZipPath) { Remove-Item -LiteralPath $ZipPath -Force }
Compress-Archive -Path "$PackDir\*" -DestinationPath $ZipPath -CompressionLevel Optimal

Write-Host "✔ 升级包目录已生成: $PackDir" -ForegroundColor Green
Write-Host "✔ 升级包压缩包已生成: $ZipPath" -ForegroundColor Green
Write-Host ''
Write-Host '使用方法: 复制压缩包到目标电脑并解压到原目录旁（或任意位置），双击“一键升级部署.exe”或“一键升级部署.bat”即可自动寻址合并程序文件，原有 data 数据 100% 不变。' -ForegroundColor Yellow

if (-not $NoPause) {
    Write-Host ''
    [void](Read-Host '按回车键退出')
}