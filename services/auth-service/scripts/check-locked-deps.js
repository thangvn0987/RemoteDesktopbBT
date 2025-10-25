#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const pkgPath = path.join(__dirname, "..", "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

function hasFloating(deps = {}) {
  return Object.entries(deps).filter(([name, version]) =>
    /[\^~]/.test(version)
  );
}

const floating = [
  ...hasFloating(pkg.dependencies),
  ...hasFloating(pkg.devDependencies),
  ...hasFloating(pkg.peerDependencies),
  ...hasFloating(pkg.optionalDependencies),
];

if (floating.length) {
  console.error(
    "Floating dependency versions detected (use exact versions, no ^ or ~):"
  );
  for (const [name, version] of floating) {
    console.error(` - ${name}@${version}`);
  }
  process.exit(1);
} else {
  console.log("All dependency versions are pinned (no ^ or ~).");
}
