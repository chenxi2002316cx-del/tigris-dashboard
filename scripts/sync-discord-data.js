#!/usr/bin/env node

const fs = require("fs");

const html = fs.readFileSync("index.html", "utf8");
const match = html.match(/\/\*DATA-START\*\/\s*const DATA = ([\s\S]*?);\s*\/\*DATA-END\*\//);
if (!match) {
  console.error("DATA block not found in index.html");
  process.exit(1);
}

fs.writeFileSync(
  "functions/_data.js",
  `// Generated from index.html. Keep this in sync when dashboard DATA changes.\nexport const DATA = ${match[1]};\n`
);

console.log("Synced functions/_data.js from index.html");
