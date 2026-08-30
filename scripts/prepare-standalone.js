// Next.js "standalone" output does not include the public/ folder or the
// .next/static assets by default — it expects you to copy them in.
// Run this after `next build` and before packaging with electron-builder.
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const standaloneDir = path.join(root, ".next", "standalone");

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

copyDir(path.join(root, "public"), path.join(standaloneDir, "public"));
copyDir(
  path.join(root, ".next", "static"),
  path.join(standaloneDir, ".next", "static")
);

console.log("Copied public/ and .next/static into .next/standalone");
