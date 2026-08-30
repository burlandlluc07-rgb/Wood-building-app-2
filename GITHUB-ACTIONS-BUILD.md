# Building the .exe with GitHub Actions (no local setup needed)

This lets a free Microsoft-hosted Windows machine build your installer,
so you don't need Visual Studio Build Tools, Python, or any of that on
your own PC.

## One-time setup

1. **Create a GitHub account** if you don't have one: https://github.com/join
2. **Create a new repository**:
   - Go to https://github.com/new
   - Name it whatever you like (e.g. `nestforge`)
   - Choose **Private** if you don't want it publicly visible (this is
     free — private repos are unlimited on GitHub's free plan)
   - Don't add a README/gitignore — leave it empty
   - Click "Create repository"
3. **Push this project to it.** In a terminal, inside the
   `nestforge-current` folder:
   ```
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
   git push -u origin main
   ```
   (Replace the URL with the one GitHub shows you after creating the repo.
   If `git` isn't installed, grab it from https://git-scm.com/downloads —
   you'll need it anyway for step-by-step version history as you keep
   developing.)

## Running the build

Pushing to `main` automatically starts the build. To check on it or
re-run it manually:

1. Go to your repo on github.com
2. Click the **Actions** tab
3. You'll see "Build Windows EXE" running (or click "Run workflow" on
   the left if you want to trigger it without pushing a new change)
4. Wait a few minutes — it installs everything and builds fresh each time
5. When it finishes (green checkmark), click into that run, scroll to
   **Artifacts** at the bottom, and download
   `NestForge-windows-installer` — that's a zip containing your `.exe`

## Making changes later

Any time you edit the app and want a new build:
```
git add .
git commit -m "describe what changed"
git push
```
That's it — the Action re-runs automatically and a new installer shows
up in Actions → Artifacts a few minutes later.

## If the Action fails

Click into the failed run in the Actions tab — each step is expandable
and shows the actual error, similar to what you were seeing locally.
Paste it here and I'll help debug it. The advantage now is the
environment is identical every time (Microsoft's clean Windows image),
so once it works, it'll keep working.
