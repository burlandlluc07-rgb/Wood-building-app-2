const { app, BrowserWindow, dialog } = require("electron");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const fs = require("node:fs");

let serverProcess = null;
let mainWindow = null;

/** Resources live next to the exe when packaged, next to the project when dev. */
function resourcesRoot() {
  return app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, "..");
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function waitForServer(port, timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (function attempt() {
      const socket = net.connect(port, "127.0.0.1");
      socket.once("connect", () => {
        socket.end();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error("NestForge server did not start in time"));
        } else {
          setTimeout(attempt, 250);
        }
      });
    })();
  });
}

async function startServer() {
  const port = await getFreePort();
  const standaloneDir = path.join(resourcesRoot(), "standalone");
  const serverEntry = path.join(standaloneDir, "server.js");

  if (!fs.existsSync(serverEntry)) {
    throw new Error(
      `Could not find server.js at ${serverEntry}. Did the build copy .next/standalone into resources/standalone?`
    );
  }

  // Keep the database in the OS-standard per-user app-data folder so it
  // survives updates/reinstalls and each Windows user gets their own file.
  const dbPath = path.join(app.getPath("userData"), "nestforge.db");

  serverProcess = spawn(process.execPath, [serverEntry], {
    cwd: standaloneDir,
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
      DATABASE_URL: dbPath,
      // Run the bundled Electron binary as a plain Node process so end
      // users don't need Node.js installed separately.
      ELECTRON_RUN_AS_NODE: "1",
    },
    stdio: "inherit",
  });

  serverProcess.on("exit", (code) => {
    if (code && code !== 0 && mainWindow) {
      dialog.showErrorBox(
        "NestForge server stopped",
        `The local server exited unexpectedly (code ${code}).`
      );
    }
  });

  await waitForServer(port);
  return `http://127.0.0.1:${port}`;
}

async function createWindow() {
  try {
    const url = await startServer();
    mainWindow = new BrowserWindow({
      width: 1360,
      height: 900,
      minWidth: 960,
      minHeight: 640,
      title: "NestForge",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    mainWindow.setMenuBarVisibility(false);
    await mainWindow.loadURL(url);
  } catch (err) {
    dialog.showErrorBox("NestForge failed to start", String(err));
    app.quit();
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverProcess) serverProcess.kill();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
