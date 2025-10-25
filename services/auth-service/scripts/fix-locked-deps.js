#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const pkgPath = path.join(__dirname, "..", "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

function stripPrefixes(obj = {}) {
  for (const k of Object.keys(obj)) {
    obj[k] = String(obj[k]).replace(/^[\^~]/, "");
  }
}

stripPrefixes(pkg.dependencies);
stripPrefixes(pkg.devDependencies);
stripPrefixes(pkg.peerDependencies);
stripPrefixes(pkg.optionalDependencies);

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log(
  "Removed ^/~ prefixes from dependency versions. Commit updated package.json."
);
