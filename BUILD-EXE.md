# Building NestForge as a Windows .exe

This wraps the existing Next.js app + SQLite database in Electron, so it
runs as a normal desktop app with no server setup and no internet
connection required. The database file lives in the user's AppData folder
(`%APPDATA%/NestForge/nestforge.db`), separate from the install.

I couldn't run these steps for you in this sandbox (no internet access
here), but they're all wired up in the project now — just run them on your
own Windows machine.

## One-time requirements

- **Node.js** (LTS, 20 or newer) — https://nodejs.org
- **Windows Build Tools**, needed to compile `better-sqlite3`'s native
  addon: open PowerShell **as Administrator** and run:
  ```
  npm install --global windows-build-tools
  ```
  (or install "Desktop development with C++" via Visual Studio Build Tools,
  plus Python 3, if that command is deprecated on your Node version)

## Steps

1. Unzip the project and open a terminal in its folder.
2. Install dependencies:
   ```
   npm install
   ```
3. Build the installer in one command:
   ```
   npm run dist:win
   ```
   This does three things in order:
   - `rebuild:native` — recompiles `better-sqlite3` for Electron's Node
     version (Electron ships its own Node build, slightly different from
     your system Node, so the native database driver has to match it)
   - `build:next` — builds the Next.js app in standalone mode and copies
     `public/` + static assets into it
   - `electron-builder --win` — packages everything into a Windows
     installer

4. Find the result in `dist/` — something like
   `NestForge Setup 0.1.0.exe`. That's the installer you share/run.

## Notes

- First launch may take a second or two while the local server starts —
  that's expected.
- If you change the app's icon later, add an `icon` field under `build.win`
  in `package.json` pointing at a `.ico` file.
- If `dist:win` fails on the native-module step, it's almost always the
  Windows build tools (Python/C++ compiler) missing — that's the fussiest
  part of this whole setup.
- If you'd rather not deal with native build tools locally, this project
  can also be built into a `.exe` via a free GitHub Actions workflow
  running on a Windows runner — say the word and I'll set that up too.
