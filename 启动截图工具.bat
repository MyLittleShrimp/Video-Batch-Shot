@echo off
setlocal
title VideoBatchShot
cd /d "%~dp0"

if not exist "%~dp0server.js" goto NO_SERVER

set "NODE=%~dp0node\node.exe"
if exist "%NODE%" goto HAVE_NODE
set "NODE=node"
"%NODE%" --version >nul 2>nul
if errorlevel 1 goto NO_NODE

:HAVE_NODE
if exist "%~dp0bin\ffmpeg.exe" goto RUN
where ffmpeg >nul 2>nul
if errorlevel 1 goto NO_FFMPEG

:RUN
cls
echo ==============================================
echo   视频批量截图工具  v1.0.0
echo ----------------------------------------------
echo   正在启动，浏览器会自动打开界面
echo   关闭这个黑色窗口即退出工具
echo ==============================================
echo.
"%NODE%" server.js
set "RC=%ERRORLEVEL%"
echo.
if not "%RC%"=="0" echo   [x] 服务异常退出，代码 %RC%
if "%RC%"=="0" echo   服务已正常退出。
echo   按任意键关闭窗口。
pause >nul
exit /b %RC%

:NO_NODE
echo.
echo   [x] 没有找到 Node.js 运行环境
echo       安装版：请重新运行安装包
echo       源码版：请先安装 Node.js 18 或更高版本
echo.
pause
exit /b 1

:NO_FFMPEG
echo.
echo   [x] 没有找到 ffmpeg，截图功能无法使用
echo       安装版：请重新运行安装包
echo       源码版：请把 ffmpeg 的 bin 目录加入系统 PATH
echo.
pause
exit /b 1

:NO_SERVER
echo.
echo   [x] 当前目录下找不到 server.js
echo       请确认本文件与 server.js 放在同一个文件夹
echo.
pause
exit /b 1
