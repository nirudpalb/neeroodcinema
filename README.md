# NEEROOD CINEMA (Electron)

A Windows desktop movie library with a custom NEEROOD CINEMA app icon, glassmorphism / 3D-card UI, folder scanning, persistent JSON settings, search, sorting and in-app full-screen video playback.

## Requirements
- Windows 10/11
- Node.js LTS (includes npm)
- Internet connection for the first install (downloads Electron dependencies)

## Run the app
1. Extract this folder to a location such as `D:\Apps\neerood-cinema-electron`.
2. Open the extracted folder in File Explorer.
3. Double-click `INSTALL_AND_RUN.bat`.
   - Or open Command Prompt in this folder and run `npm install`, then `npm start`.

The app starts with the requested default folder:
`D:\Nirudpal Bharali\Movies & Series`

If that folder does not exist, it will still start; add the correct folder from **Add folder**. It scans video files in subfolders (up to 8 directory levels).

## Persistent settings
Folder paths are saved automatically to Electron's per-user app data file:
`%APPDATA%\neerood-cinema\library.json` (exact location is shown in Library folders in the app).

Example:
```json
{
  "folders": [
    "D:\\Nirudpal Bharali\\Movies & Series"
  ],
  "lastFolder": "D:\\Nirudpal Bharali\\Movies & Series"
}
```
This is written by the app. You do not need to create it manually. This JSON stores folder paths only; it does not grant Windows access if a drive is disconnected or the folder is removed.

## Build a Windows installer
1. Run `INSTALL_AND_RUN.bat` once (or run `npm install`).
2. Run `BUILD_INSTALLER.bat`.
3. The installer will be created in `dist\`.

## Playback notes
The app plays video inside its own player using Chromium's media support. MP4/H.264/AAC is the safest common format. Some MKV, HEVC/H.265, AVI, DTS or other codecs may not be supported by the built-in Chromium decoder on every Windows installation.


## Online metadata, posters and series grouping

1. Launch NEEROOD CINEMA and open **Library folders**.
2. Create a free TMDB account and request an API key at https://www.themoviedb.org/settings/api.
3. Paste the TMDB API key into the **TMDB API key** field and click **Save & identify**.
4. The app searches movie and TV metadata, caches descriptions/genres/year and downloads poster images into the app's local data folder.
5. Use **Refresh online metadata** to retry or update matches.

The API key is stored in the local `library.json` settings file. Metadata and downloaded poster files are stored locally after retrieval. Internet is needed for first-time identification or refresh; previously cached metadata/posters remain available offline. TMDB results can be imperfect, so check the matched title. The app does not rename or alter your original video files.

### Series naming
The app groups common episode filenames such as `Show.Name.S01E02.mkv` into one series card. Click that card to choose a season and episode. Episode names without a recognizable season/episode marker may remain individual videos; use consistent `S01E01`-style names for the most reliable grouping.

### API provider
Movie and TV metadata/poster lookup uses The Movie Database (TMDB) API. This app is an independent personal library and is not endorsed or certified by TMDB.
