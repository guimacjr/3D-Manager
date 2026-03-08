const { app, BrowserWindow, dialog } = require("electron");
const { spawn } = require("node:child_process");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const API_PORT = "3333";
const WEB_PORT = 4173;
let backendProcess = null;
let webServer = null;
const backendLogLines = [];

function getPortableBaseDir() {
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return process.env.PORTABLE_EXECUTABLE_DIR;
  }
  return path.dirname(process.execPath);
}

function getPortableDataRoot() {
  return path.join(getPortableBaseDir(), "3d-manager-data");
}

const portableDataRoot = getPortableDataRoot();
app.setPath("userData", path.join(portableDataRoot, "electron-user-data"));
app.setPath("sessionData", path.join(portableDataRoot, "electron-cache"));

function getRuntimeRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app");
  }
  return path.resolve(__dirname, "..", "release", "windows");
}

function ensureRuntimeFiles(runtimeRoot) {
  const requiredPaths = [
    path.join(runtimeRoot, "mobile-web", "index.html"),
    path.join(runtimeRoot, "backend", "dist", "index.js"),
    path.join(runtimeRoot, "backend", "migrations")
  ];

  for (const p of requiredPaths) {
    if (!fs.existsSync(p)) {
      throw new Error(`Arquivo/pasta obrigatorio nao encontrado: ${p}`);
    }
  }
}

function ensurePortableDataDirs(portableDataRoot) {
  const dirs = [
    path.join(portableDataRoot, "data"),
    path.join(portableDataRoot, "storage", "media"),
    path.join(portableDataRoot, "logs"),
    path.join(portableDataRoot, "electron-user-data"),
    path.join(portableDataRoot, "electron-cache"),
  ];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getLogFilePath() {
  return path.join(portableDataRoot, "logs", "startup-error.txt");
}

function appendLogLine(line) {
  try {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(getLogFilePath(), `[${timestamp}] ${line}\n`, "utf8");
  } catch {
    // evita quebrar a inicializacao por falha de log
  }
}

function startBackend(runtimeRoot, portableDataRoot) {
  if (backendProcess) return;

  const backendRunner = path.join(__dirname, "backend-runner.cjs");
  const backendEntry = path.join(runtimeRoot, "backend", "dist", "index.js");
  const dbPath = path.join(portableDataRoot, "data", "app.sqlite");
  const mediaRoot = path.join(portableDataRoot, "storage", "media");

  backendProcess = spawn(process.execPath, [backendRunner, backendEntry], {
    cwd: path.join(runtimeRoot, "backend"),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: API_PORT,
      DB_PATH: dbPath,
      MEDIA_ROOT: mediaRoot,
    },
    windowsHide: true,
    stdio: "pipe"
  });

  backendProcess.on("error", (error) => {
    const msg = `[error] ${String(error)}`;
    backendLogLines.push(msg);
    appendLogLine(`backend ${msg}`);
    if (backendLogLines.length > 80) backendLogLines.shift();
  });

  backendProcess.on("exit", (code) => {
    if (code !== 0) {
      console.error(`Backend finalizou com codigo ${code}`);
      appendLogLine(`backend exit code=${code}`);
    }
    backendProcess = null;
  });

  backendProcess.stdout.on("data", (data) => {
    const line = String(data);
    backendLogLines.push(`[stdout] ${line}`);
    appendLogLine(`backend stdout: ${line.trimEnd()}`);
    if (backendLogLines.length > 80) backendLogLines.shift();
  });

  backendProcess.stderr.on("data", (data) => {
    const line = String(data);
    console.error(`[backend] ${line}`);
    backendLogLines.push(`[stderr] ${line}`);
    appendLogLine(`backend stderr: ${line.trimEnd()}`);
    if (backendLogLines.length > 80) backendLogLines.shift();
  });
}

function stopBackend() {
  if (!backendProcess) return;
  backendProcess.kill();
  backendProcess = null;
}

function resolveContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".ico") return "image/x-icon";
  if (ext === ".map") return "application/json; charset=utf-8";
  return "application/octet-stream";
}

function startWebServer(runtimeRoot) {
  if (webServer) return Promise.resolve();

  const webRoot = path.join(runtimeRoot, "mobile-web");

  return new Promise((resolve, reject) => {
    webServer = http.createServer((req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
        const relativePath = urlPath === "/" ? "/index.html" : urlPath;
        let absolutePath = path.join(webRoot, relativePath);

        if (!absolutePath.startsWith(webRoot)) {
          res.statusCode = 400;
          res.end("Invalid path");
          return;
        }

        if (!fs.existsSync(absolutePath) || fs.statSync(absolutePath).isDirectory()) {
          absolutePath = path.join(webRoot, "index.html");
        }

        const content = fs.readFileSync(absolutePath);
        res.setHeader("Content-Type", resolveContentType(absolutePath));
        res.statusCode = 200;
        res.end(content);
      } catch (error) {
        res.statusCode = 500;
        res.end(`Internal error: ${String(error)}`);
      }
    });

    webServer.on("error", (error) => {
      reject(error);
    });

    webServer.listen(WEB_PORT, "127.0.0.1", () => resolve());
  });
}

function stopWebServer() {
  if (!webServer) return;
  webServer.close();
  webServer = null;
}

function waitForBackendHealth(timeoutMs = 30000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(`http://127.0.0.1:${API_PORT}/health`, (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += String(chunk);
        });
        res.on("end", () => {
          if (res.statusCode === 200) {
            resolve();
            return;
          }

          if (Date.now() - startedAt > timeoutMs) {
            reject(new Error(`Backend respondeu ${res.statusCode}: ${body}`));
            return;
          }
          setTimeout(check, 300);
        });
      });

      req.on("error", () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error("Timeout aguardando /health do backend"));
          return;
        }
        setTimeout(check, 300);
      });
    };

    check();
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  });

  win.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(`
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width,initial-scale=1" />
          <title>3D Manager</title>
          <style>
            body {
              margin: 0;
              font-family: "Segoe UI", Arial, sans-serif;
              background: #f6f7fb;
              color: #1f2a45;
              display: grid;
              place-items: center;
              height: 100vh;
            }
            .box {
              text-align: center;
              padding: 24px;
              border-radius: 12px;
              background: #ffffff;
              box-shadow: 0 8px 24px rgba(18, 24, 40, 0.08);
            }
            .title {
              font-size: 18px;
              font-weight: 700;
              margin-bottom: 8px;
            }
            .subtitle {
              font-size: 14px;
              color: #576179;
            }
          </style>
        </head>
        <body>
          <div class="box">
            <div class="title">3D Manager</div>
            <div class="subtitle">Inicializando...</div>
          </div>
        </body>
      </html>
    `)}`
  );
  return win;
}

app.whenReady().then(() => {
  try {
    const runtimeRoot = getRuntimeRoot();
    ensureRuntimeFiles(runtimeRoot);
    ensurePortableDataDirs(portableDataRoot);
    appendLogLine("app init started");
    const win = createWindow();

    startBackend(runtimeRoot, portableDataRoot);
    Promise.all([startWebServer(runtimeRoot), waitForBackendHealth()])
      .then(() => win.loadURL(`http://127.0.0.1:${WEB_PORT}`))
      .catch((error) => {
        const recentLogs = backendLogLines.slice(-20).join("\n");
        const details = `${String(error)}\n\nLogs backend:\n${recentLogs || "(sem logs)"}`;
        appendLogLine(`startup failure: ${String(error)}`);
        appendLogLine(`recent backend logs:\n${recentLogs || "(sem logs)"}`);
        dialog.showErrorBox("Falha ao iniciar backend/interface", details);
        app.quit();
      });
  } catch (error) {
    appendLogLine(`fatal init error: ${String(error)}`);
    dialog.showErrorBox("Falha ao iniciar 3D Manager", String(error));
    app.quit();
  }
});

app.on("window-all-closed", () => {
  stopWebServer();
  stopBackend();
  app.quit();
});

app.on("before-quit", () => {
  stopWebServer();
  stopBackend();
});
