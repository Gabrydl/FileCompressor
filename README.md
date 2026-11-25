# FileCompressor

Make videos, photos, PDFs, audio and Office files smaller (or convert them), offline.

## Download

### [⬇ Download for Windows](https://github.com/Gabrydl/FileCompressor/releases/latest/download/FileCompressor-Setup.exe)
Installer for Windows 10/11 (no admin needed).

### [⬇ Download the APK for Android](https://github.com/Gabrydl/FileCompressor/releases/latest/download/FileCompressor.apk)
Open the downloaded file on the phone to install it (allow installing from this source if asked).

Older versions: [all releases](../../releases).

## Updates
Both apps check the latest release every time they open. On Windows **Update now** downloads the new version, replaces the program
files (the `data` folder with settings and history is kept) and restarts. On the phone the new APK is downloaded to install over the old one.

## Source
- `www/` – Windows interface, `android-www/` – phone interface
- `desktop/` – Windows shell + engine (ffmpeg, sharp, MuPDF, JSZip), including `updater.js`
- `android/FileCompressor.apk` – signed phone build, published with the release
- `tools/apk_repack.py` – puts new `android-www/` pages into the APK and signs it
- `.github/workflows/release.yml` – builds the Windows zip (npm libraries + ffmpeg are fetched during the build) and publishes release `v<version in desktop/package.json>`

To ship a new version: change the code, raise `version` in `desktop/package.json`, `VERSION` in `www/app.js` and `APP_VERSION` in `android-www/app.js`,
rebuild the APK (`python3 tools/apk_repack.py <old apk> android/FileCompressor.apk <keys dir> --cn FileCompressor --assets android-www:assets/www/ --version-code <higher number>`), push.
