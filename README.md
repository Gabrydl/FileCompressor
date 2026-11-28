# FileCompressor

Make videos, photos, PDFs, audio and Office files smaller (or convert them), offline.

## Install on Windows

1. On this page click **Code › Download ZIP**.
2. Unzip the **whole** ZIP (right-click › Extract all), not just one file.
3. Run **Setup.exe**. Keep `Setup-1.bin`, `Setup-2.bin` … next to it: they are the rest of the installer (GitHub doesn't allow
   files over 100 MB, so it is cut in parts). The usual installer opens: language, install, and later Repair / Uninstall.

If Windows shows "Windows protected your PC", click **More info › Run anyway** (the app isn't signed with a paid certificate).
Phone: `android/FileCompressor.apk` is in the same ZIP.

## Updates
Both apps check the latest release every time they open. On Windows **Update now** downloads the new version, replaces the program
files (the `data` folder with settings and history is kept) and restarts. On the phone the new APK is downloaded to install over the old one.

## Source
One program: the same interface (`www/`) runs on Windows and on the phone; only the engine underneath changes.
- `www/` – the interface (21 languages in `www/locales/`). On Windows it talks to `desktop/preload.js` (`window.Desktop`), on the
  phone to `www/host.js` (`window.Host`, over the app's `window.Android` bridge). Things that exist only on a computer (drag out,
  Ctrl+V, right-click menu, Windows notification) are marked `pc-only`; the two-pane layout (Files / Settings) is used on the phone
  and in narrow windows.
- `desktop/` – Windows shell + engine (ffmpeg, sharp, MuPDF, JSZip), including `updater.js`
- `android-app/` – the phone app: Kotlin engine with the same steps and options as the Windows engine (ffmpeg for video and audio,
  trim, mono; Android encoders for photos, resize, EXIF removal; PdfBox for PDFs; Office pictures; file info, before/after view,
  history and restore). It shows `www/`, copied into the APK at build time. `.github/workflows/android.yml` builds it (unsigned) into
  the `android-build` pre-release; sign it with `tools/apk_repack.py <apk> <out.apk> <keys dir> --cn FileCompressor`.
  Not on the phone: trimming fonts inside PDFs (PdfBox can't), so that tick box isn't offered there.
- `android/FileCompressor.apk` – signed phone build, published with the release
- `.github/workflows/release.yml` – builds the Windows installer (NSIS, `installer/App.nsi`) and publishes release `v<version in desktop/package.json>`
- `Setup.exe` + `Setup-N.bin` (main folder) – put there by `release.yml` on every new version: the installer cut into 90 MB parts and a
  small `Setup.exe` (`installer/Launcher.nsi`) that joins them and runs it. The old ones are removed from the whole history of `main`
  each time (so the repository doesn't grow by ~165 MB per version): **after each release, pull with `git fetch && git reset --hard origin/main`**
  (or clone again) before pushing, because `main` has been rewritten.

## Building the Windows app without GitHub
Unzip `electron-v45.3.0-win32-x64.zip` into `FileCompressor/`, delete `resources/default_app.asar`, copy `desktop/` into `resources/app/`
and `www/` into `resources/app/www/`, run `npm ci --omit=dev --os=win32 --cpu=x64` in `resources/app/`, put `ffmpeg.exe` (BtbN win64 gpl) in
`resources/bin/`, rename `electron.exe` to `FileCompressor.exe`, run `tools/set_exe_info.js` (needs `npm i resedit pe-library`), then `makensis` as above.

To ship a new version: change the code, raise `version` in `desktop/package.json`, `VERSION` in `www/app.js` and `versionCode`/`versionName`
in `android-app/app/build.gradle.kts`, let `android.yml` build the APK, sign it into `android/FileCompressor.apk`, push.

## Languages, Repair and log (FileCompressor 1.8.0 / PdfEditor 1.7.0)
- The interface is in 21 languages: `www/locales/<code>.txt` (`n|text`, same numbers as `en.txt`). Texts in code go through `T("English")` (`www/i18n.js`); the flag button next to light/dark changes the language.
- The installer (`installer/App.nsi`, NSIS) asks the language first, with the Windows language preselected. Run `Setup.exe` again (it is kept in the program folder, or use Windows Settings › Apps › Modify) to **Repair** or **Uninstall**. Uninstalling never deletes the Compressed/Original folders.
- Windows: `<App>.log` in the program folder (what was done and every error); "Open the log file" in Settings.
- `tools/check_translations.bat`: quick offline check of every language, then an optional review by Gemini. Report in `translation_check.txt`.
