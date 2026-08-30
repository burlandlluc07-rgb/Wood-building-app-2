// Runs the built Next.js app directly via the `next` package's programmatic
// API. This file is copied to sit next to a full node_modules + .next build
// output + public folder + package.json (see package.json "build.extraResources"),
// so `require("next")` resolves normally — no reliance on Next's standalone
// output file-tracing, which has known gaps that drop required files.
const path = require("node:path");
const { createServer } = require("node:http");
const next = require("next");

const port = Number(process.env.PORT) || 3000;
const hostname = process.env.HOSTNAME || "127.0.0.1";
const dir = __dirname;

const app = next({ dev: false, dir, hostname, port });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    createServer((req, res) => handle(req, res)).listen(port, hostname, () => {
      console.log(`NestForge server ready on http://${hostname}:${port}`);
    });
  })
  .catch((err) => {
    console.error("Failed to start NestForge server:", err);
    process.exit(1);
  });
