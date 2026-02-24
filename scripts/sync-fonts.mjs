import fs from "fs";
import path from "path";

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dst, name);
    const stat = fs.statSync(s);
    if (stat.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

const root = process.cwd();

const src = path.join(root, "packages", "pro-fonts", "fonts");
const webDst = path.join(root, "apps", "web", "public", "fonts");
const apiDst = path.join(root, "apps", "api", "fonts");

if (!fs.existsSync(src)) {
  console.error("Source fonts dir not found:", src);
  process.exit(1);
}

copyDir(src, webDst);
copyDir(src, apiDst);

console.log("✅ Fonts synced:");
console.log("  ->", webDst);
console.log("  ->", apiDst);
