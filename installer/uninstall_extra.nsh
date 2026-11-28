; uninstall: what the app itself added to Windows
; "Compress with FileCompressor" in the Explorer right-click menu, added by the app
  DeleteRegKey HKCU "Software\Classes\*\shell\FileCompressor"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\FileCompressor"
