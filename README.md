# FileCompressor

Make videos, photos, PDFs, audio and Office files smaller (or convert them), offline.

## Download

The Windows installer and the Android APK are published in this repository's Releases section.

## Updates
Both apps check the latest release every time they open. On Windows **Update now** downloads the new version, replaces the program
files (the `data` folder with settings and history is kept) and restarts. On the phone the new APK is downloaded to install over the old one.

## Source
- `www/` – Windows interface, `android-www/` – phone interface
- `desktop/` – Windows shell + engine (ffmpeg, sharp, MuPDF, JSZip), including `updater.js`
- `android-app/` – the phone app's source: Kotlin engine (same steps as the Windows engine: ffmpeg for video, audio and animated GIFs,
  Android encoders for photos, PdfBox for PDFs) that shows the `android-www/` page. `.github/workflows/android.yml` builds it
  (unsigned) into the `android-build` pre-release; sign it with `tools/apk_repack.py ... keys/filecompressor --cn FileCompressor`
- `android/FileCompressor.apk` – signed phone build, published with the release
- `tools/apk_repack.py` – puts new `android-www/` pages into the APK and signs it
- `.github/workflows/release.yml` – builds the Windows installer (Inno Setup) and publishes release `v<version in desktop/package.json>`
- `installer/FileCompressor.nsi` – the same installer made with NSIS, which also builds on Linux without GitHub:
  `makensis -DVERSION=<version> -DSRC=<built app folder> -DOUT=FileCompressor-Setup.exe installer/FileCompressor.nsi`

## Building the Windows app without GitHub
Unzip `electron-v45.3.0-win32-x64.zip` into `FileCompressor/`, delete `resources/default_app.asar`, copy `desktop/` into `resources/app/`
and `www/` into `resources/app/www/`, run `npm ci --omit=dev --os=win32 --cpu=x64` in `resources/app/`, put `ffmpeg.exe` (BtbN win64 gpl) in
`resources/bin/`, rename `electron.exe` to `FileCompressor.exe`, run `tools/set_exe_info.js` (needs `npm i resedit pe-library`), then `makensis` as above.

To ship a new version: change the code, raise `version` in `desktop/package.json`, `VERSION` in `www/app.js` and `APP_VERSION` in `android-www/app.js`,
rebuild the APK (`python3 tools/apk_repack.py <old apk> android/FileCompressor.apk <keys dir> --cn FileCompressor --assets android-www:assets/www/ --version-code <higher number>`), push.
