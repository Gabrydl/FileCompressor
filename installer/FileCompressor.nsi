; FileCompressor - Windows installer made with NSIS (builds on Linux too: makensis). Same behaviour as FileCompressor.iss:
;   per-user install in %LOCALAPPDATA%\Programs\FileCompressor (no admin), Start menu + Desktop shortcuts, settings ("data" folder)
;   kept on update. It replaces an earlier install made with the Inno Setup installer (same folder, same uninstall entry).
;   makensis -DVERSION=<version> -DSRC=<built app folder> -DOUT=<output exe> installer/FileCompressor.nsi
; Silent update from inside the app: the updater passes /VERYSILENT (Inno style) or /S; both work, and the app opens again.

Unicode true
SetCompressor /SOLID lzma
RequestExecutionLevel user
ManifestDPIAware true

!ifndef VERSION
  !define VERSION "0.0.0"
!endif
!define APP "FileCompressor"
!define EXE "FileCompressor.exe"
!define UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\{3F6B9D21-7C4E-4A8B-B1D5-9E0C2A6F4B73}_is1"

Name "${APP}"
OutFile "${OUT}"
InstallDir "$LOCALAPPDATA\Programs\${APP}"
BrandingText "${APP} ${VERSION}"
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APP}"
VIAddVersionKey "FileDescription" "${APP} installer"
VIAddVersionKey "CompanyName" "Gabrydl"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" ""

!include "MUI2.nsh"
!include "FileFunc.nsh"

!define MUI_ICON "..\desktop\icon.ico"
!define MUI_UNICON "..\desktop\icon.ico"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Open ${APP}"
!define MUI_WELCOMEPAGE_TITLE "Install ${APP} ${VERSION}"
!define MUI_WELCOMEPAGE_TEXT "Videos, photos, PDFs, audio and Office files made smaller, offline.$\r$\n$\r$\n${APP} is installed for you only, in your user folder, so it doesn't need administrator rights. If an older version is installed, it is updated and your settings are kept.$\r$\n$\r$\nClick Next to install it."

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Function .onInit
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/VERYSILENT" $R1
  IfErrors +2
  SetSilent silent
FunctionEnd

Section "Install"
  ; close the running app first
  nsExec::Exec '"$SYSDIR\taskkill.exe" /f /im ${EXE}'
  Sleep 800
  SetOutPath "$INSTDIR"
  ; old pages from the previous version (settings live in the "data" folder and are kept)
  RMDir /r "$INSTDIR\resources\app\www"
  ; files left by the earlier Inno Setup installer
  Delete "$INSTDIR\unins000.exe"
  Delete "$INSTDIR\unins000.dat"
  File /r "${SRC}\*.*"
  WriteUninstaller "$INSTDIR\Uninstall ${APP}.exe"

  CreateShortcut "$SMPROGRAMS\${APP}.lnk" "$INSTDIR\${EXE}"
  CreateShortcut "$DESKTOP\${APP}.lnk" "$INSTDIR\${EXE}"

  WriteRegStr HKCU "${UNKEY}" "DisplayName" "${APP}"
  WriteRegStr HKCU "${UNKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNKEY}" "Publisher" "Gabrydl"
  WriteRegStr HKCU "${UNKEY}" "DisplayIcon" "$INSTDIR\${EXE}"
  WriteRegStr HKCU "${UNKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNKEY}" "UninstallString" '"$INSTDIR\Uninstall ${APP}.exe"'
  WriteRegStr HKCU "${UNKEY}" "QuietUninstallString" '"$INSTDIR\Uninstall ${APP}.exe" /S'
  WriteRegStr HKCU "${UNKEY}" "URLInfoAbout" "https://github.com/Gabrydl/FileCompressor"
  WriteRegDWORD HKCU "${UNKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNKEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  WriteRegDWORD HKCU "${UNKEY}" "EstimatedSize" "$0"

  ; silent update started from inside the app: open it again
  IfSilent 0 +2
  Exec '"$INSTDIR\${EXE}"'
SectionEnd

Section "Uninstall"
  nsExec::Exec '"$SYSDIR\taskkill.exe" /f /im ${EXE}'
  Sleep 800
  Delete "$SMPROGRAMS\${APP}.lnk"
  Delete "$DESKTOP\${APP}.lnk"
  ; "Compress with FileCompressor" in the Explorer right-click menu, added by the app
  DeleteRegKey HKCU "Software\Classes\*\shell\FileCompressor"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\FileCompressor"
  DeleteRegKey HKCU "${UNKEY}"
  RMDir /r "$INSTDIR"
SectionEnd
