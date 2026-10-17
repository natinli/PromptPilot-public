@echo off
chcp 65001 >nul
title Prompt Pilot - 开发服务器

echo ============================================
echo    Prompt Pilot - 启动开发环境
echo ============================================
echo.

:: 切换到脚本所在目录
cd /d "%~dp0"

:: 检查 Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js ^>= 18
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

:: 检查 Rust
where cargo >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Rust/Cargo，请先安装 Rust
    echo 下载地址: https://rustup.rs/
    pause
    exit /b 1
)

echo [✓] Node.js 版本:
node -v
echo [✓] Cargo 版本:
cargo --version
echo.

:: 检查 node_modules 是否存在，不存在则安装依赖
if not exist "node_modules" (
    echo [信息] 首次运行，正在安装前端依赖...
    call npm install
    if %errorlevel% neq 0 (
        echo [错误] npm install 失败
        pause
        exit /b 1
    )
    echo.
)

echo [启动] 正在启动 Tauri 开发服务器...
echo [提示] 首次编译 Rust 后端可能需要 1-3 分钟，请耐心等待
echo [提示] 按 Ctrl+C 可停止服务
echo ============================================
echo.

call npm run tauri:dev

echo.
echo [信息] 开发服务器已停止
pause
