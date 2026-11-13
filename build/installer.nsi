Unicode true

!include "MUI2.nsh"
!include "FileFunc.nsh"

!define APP_NAME "视频批量截图工具"
!define APP_VER "1.1.0"
!define APP_PUBLISHER "小微工作室"
!define APP_EXE "视频批量截图工具.exe"
!define APP_SRC "pack\视频批量截图工具-win32-x64"
!define REG_UNINST "Software\Microsoft\Windows\CurrentVersion\Uninstall\VideoBatchShot"

Name "${APP_NAME} ${APP_VER}"
OutFile "..\dist\视频批量截图工具_v${APP_VER}_安装包.exe"
InstallDir "$LOCALAPPDATA\Programs\${APP_NAME}"
InstallDirRegKey HKCU "Software\${APP_NAME}" "InstallDir"
RequestExecutionLevel user
; 声明 DPI 感知：高分屏下由 NSIS 按系统 DPI 重新绘制界面，避免整窗被系统拉伸导致文字发虚
ManifestDPIAware true
ManifestDPIAwareness "System"
SetCompressor /SOLID lzma
SetCompressorDictSize 32
BrandingText "${APP_NAME} ${APP_VER}"
ShowInstDetails show
ShowUninstDetails show

Icon "app.ico"
UninstallIcon "app.ico"

VIProductVersion "1.1.0.0"
VIAddVersionKey /LANG=2052 "ProductName" "${APP_NAME}"
VIAddVersionKey /LANG=2052 "FileDescription" "从视频批量截取画面，导出 PNG / JPG"
VIAddVersionKey /LANG=2052 "FileVersion" "${APP_VER}"
VIAddVersionKey /LANG=2052 "ProductVersion" "${APP_VER}"
VIAddVersionKey /LANG=2052 "CompanyName" "${APP_PUBLISHER}"
VIAddVersionKey /LANG=2052 "LegalCopyright" "${APP_PUBLISHER}"

; ---------------- 界面 ----------------
!define MUI_ABORTWARNING
!define MUI_ICON "app.ico"
!define MUI_UNICON "app.ico"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_RIGHT
!define MUI_HEADERIMAGE_BITMAP "header.bmp"
!define MUI_WELCOMEFINISHPAGE_BITMAP "welcome.bmp"
!define MUI_WELCOMEPAGE_TITLE "安装 ${APP_NAME}"
!define MUI_WELCOMEPAGE_TEXT "这个工具用来把一批视频各截一张图：把视频或文件夹直接拖进窗口，选好取帧位置，一次导出 PNG 或 JPG。$\r$\n$\r$\n视频只在你的电脑上处理，不上传、不复制。安装包已内置运行环境和 ffmpeg，装完即用，不需要另外配置。$\r$\n$\r$\n点“下一步”继续。"
!define MUI_FINISHPAGE_TITLE "安装完成"
!define MUI_FINISHPAGE_TEXT "${APP_NAME} 已经装好，桌面和开始菜单都有快捷方式。$\r$\n$\r$\n双击图标会直接打开程序窗口，把视频拖进去就能用。"
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "立即启动 ${APP_NAME}"
!define MUI_FINISHPAGE_LINK "查看使用说明"
!define MUI_FINISHPAGE_LINK_LOCATION "$INSTDIR\使用说明.txt"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "SimpChinese"

; ---------------- 安装前检查 ----------------
Function .onInit
  ; 程序正在运行时 exe 被占用，无法覆盖
  IfFileExists "$INSTDIR\${APP_EXE}" 0 done
  ClearErrors
  FileOpen $0 "$INSTDIR\${APP_EXE}" a
  IfErrors running
  FileClose $0
  Goto done
  running:
    MessageBox MB_ICONEXCLAMATION|MB_OK "${APP_NAME} 正在运行。$\r$\n$\r$\n请先关掉它的窗口，再重新安装。"
    Abort
  done:
FunctionEnd

; ---------------- 安装 ----------------
Section "主程序" SecMain
  SectionIn RO
  SetOutPath "$INSTDIR"

  ; 清理 1.0.x 遗留的网页版文件（node / bin / app / bat）
  RMDir /r "$INSTDIR\node"
  RMDir /r "$INSTDIR\bin"
  RMDir /r "$INSTDIR\app"
  Delete "$INSTDIR\server.js"
  Delete "$INSTDIR\启动截图工具.bat"
  Delete "$INSTDIR\README.md"
  Delete "$INSTDIR\app.ico"

  SetOverwrite on
  File /r "${APP_SRC}\*.*"

  CreateShortcut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0
  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\使用说明.lnk" "$INSTDIR\使用说明.txt"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\卸载 ${APP_NAME}.lnk" "$INSTDIR\uninstall.exe"

  WriteUninstaller "$INSTDIR\uninstall.exe"

  WriteRegStr HKCU "Software\${APP_NAME}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${REG_UNINST}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "${REG_UNINST}" "DisplayVersion" "${APP_VER}"
  WriteRegStr HKCU "${REG_UNINST}" "DisplayIcon" "$INSTDIR\${APP_EXE}"
  WriteRegStr HKCU "${REG_UNINST}" "Publisher" "${APP_PUBLISHER}"
  WriteRegStr HKCU "${REG_UNINST}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${REG_UNINST}" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr HKCU "${REG_UNINST}" "QuietUninstallString" '"$INSTDIR\uninstall.exe" /S'
  WriteRegDWORD HKCU "${REG_UNINST}" "NoModify" 1
  WriteRegDWORD HKCU "${REG_UNINST}" "NoRepair" 1

  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "${REG_UNINST}" "EstimatedSize" "$0"
SectionEnd

; ---------------- 卸载 ----------------
Section "Uninstall"
  ; 切到临时目录，否则当前目录占用会导致 INSTDIR 删不掉
  SetOutPath "$TEMP"

  Delete "$DESKTOP\${APP_NAME}.lnk"
  RMDir /r "$SMPROGRAMS\${APP_NAME}"

  ; 预览缓存在临时目录
  RMDir /r "$TEMP\vshot-cache"
  ; Electron 的用户数据（窗口尺寸、缓存等）
  RMDir /r "$APPDATA\${APP_NAME}"
  RMDir /r "$LOCALAPPDATA\${APP_NAME}"

  ; 程序目录整体清掉，再单独删掉残留的卸载器
  RMDir /r "$INSTDIR\resources"
  RMDir /r "$INSTDIR\locales"
  Delete "$INSTDIR\*.dll"
  Delete "$INSTDIR\*.pak"
  Delete "$INSTDIR\*.bin"
  Delete "$INSTDIR\*.dat"
  Delete "$INSTDIR\*.json"
  Delete "$INSTDIR\LICENSE"
  Delete "$INSTDIR\LICENSES.chromium.html"
  Delete "$INSTDIR\version"
  Delete "$INSTDIR\使用说明.txt"
  Delete "$INSTDIR\${APP_EXE}"
  Delete "$INSTDIR\uninstall.exe"

  RMDir "$INSTDIR"

  DeleteRegKey HKCU "${REG_UNINST}"
  DeleteRegKey HKCU "Software\${APP_NAME}"
SectionEnd
