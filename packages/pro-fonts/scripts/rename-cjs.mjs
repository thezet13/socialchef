import { renameSync, existsSync } from "node:fs";
if (existsSync("dist-cjs/index.js")) renameSync("dist-cjs/index.js", "dist-cjs/index.cjs");