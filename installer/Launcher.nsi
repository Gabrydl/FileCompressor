; Setup.exe for the "Code > Download ZIP" download (FileCompressor / PdfEditor).
;   makensis -DAPP=<Name> -DVERSION=<x.y.z> -DPARTS=<n> -DTOTAL=<bytes> -DOUT=<Setup.exe> installer/Launcher.nsi
; GitHub refuses files over 100 MB in a repository, so the real installer (<Name>-Setup.exe, made by App.nsi) is cut into
; Setup-1.bin, Setup-2.bin ... next to this small Setup.exe. This one has no window of its own: it joins the parts back into
; the real installer in a temporary folder, checks the size, and runs it. Everything the user sees (language, Repair...) is App.nsi.
; Any option given to Setup.exe (/S, /REPAIR ...) is passed on to the real installer.

Unicode true
ManifestDPIAware true
RequestExecutionLevel user
SilentInstall silent
SetCompressor /SOLID lzma

!include "LogicLib.nsh"
!include "FileFunc.nsh"

Name "${APP}"
OutFile "${OUT}"
Icon "..\desktop\icon.ico"
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APP}"
VIAddVersionKey "FileDescription" "${APP} Setup"
VIAddVersionKey "CompanyName" "Gabrydl"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "Copyright (C) 2026 Gabrydl"

LoadLanguageFile "${NSISDIR}\Contrib\Language files\English.nlf"
LoadLanguageFile "${NSISDIR}\Contrib\Language files\Italian.nlf"
LangString MISSING ${LANG_ENGLISH} "Setup-$0.bin is missing.$\r$\n$\r$\nSetup.exe needs all its Setup-1.bin, Setup-2.bin ... files in the same folder. Unzip the whole download (not just Setup.exe), then run Setup.exe again."
LangString MISSING ${LANG_ITALIAN} "Manca Setup-$0.bin.$\r$\n$\r$\nSetup.exe ha bisogno di tutti i file Setup-1.bin, Setup-2.bin ... nella stessa cartella. Estrai tutto lo zip (non solo Setup.exe), poi riapri Setup.exe."
LangString BROKEN ${LANG_ENGLISH} "The installation files are incomplete or damaged.$\r$\n$\r$\nDownload the ZIP again, unzip all of it and run Setup.exe."
LangString BROKEN ${LANG_ITALIAN} "I file di installazione sono incompleti o danneggiati.$\r$\n$\r$\nScarica di nuovo lo zip, estrailo tutto e apri Setup.exe."

Section
  InitPluginsDir
  StrCpy $R2 "$PLUGINSDIR\${APP}-Setup.exe"

  ; every part must be there: "Setup-1.bin"+"Setup-2.bin"+...
  StrCpy $R3 ""
  StrCpy $0 1
  ${Do}
    ${IfNot} ${FileExists} "$EXEDIR\Setup-$0.bin"
      MessageBox MB_ICONEXCLAMATION|MB_OK "$(MISSING)" /SD IDOK
      SetErrorLevel 2
      Quit
    ${EndIf}
    ${If} $R3 == ""
      StrCpy $R3 '"$EXEDIR\Setup-$0.bin"'
    ${Else}
      StrCpy $R3 '$R3+"$EXEDIR\Setup-$0.bin"'
    ${EndIf}
    IntOp $0 $0 + 1
  ${LoopUntil} $0 > ${PARTS}

  ; join them back into the real installer
  nsExec::Exec '"$SYSDIR\cmd.exe" /d /c copy /y /b $R3 "$R2"'
  Pop $1

  ; same size as the installer that was cut, otherwise a part is damaged
  StrCpy $3 0
  ClearErrors
  FileOpen $2 "$R2" r
  ${IfNot} ${Errors}
    FileSeek $2 0 END $3
    FileClose $2
  ${EndIf}
  ${If} $3 != ${TOTAL}
    MessageBox MB_ICONSTOP|MB_OK "$(BROKEN)" /SD IDOK
    SetErrorLevel 3
    Quit
  ${EndIf}

  ${GetParameters} $R0
  ExecWait '"$R2" $R0' $R1
  Delete "$R2"
  SetErrorLevel $R1
SectionEnd
