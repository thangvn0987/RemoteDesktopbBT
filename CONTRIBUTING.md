# Contributing Guidelines

To ensure fully reproducible builds across all machines and CI, please follow these rules:

## Node.js version

- Use Node.js version specified in `.nvmrc` (Node 20).
- If you use `nvm`, run `nvm use` at the repo root before development.
- Docker images for Node services must match this Node.js major version.

## Installing dependencies

- Always use `npm ci` (never `npm install`) to install dependencies.
  - `npm ci` installs exactly what's in `package-lock.json`, ensuring deterministic builds.
  - This also fails if `package.json` and `package-lock.json` are out of sync, helping catch mistakes early.

## package-lock.json

- Do not edit `package-lock.json` by hand.
- If you need to add or upgrade a dependency, do so locally and let npm update the lock file automatically, then commit both `package.json` and `package-lock.json` together in the same PR.
- If the lock file is missing, generate it with:
  - `npm install --package-lock-only` (one-time to create the lock file), then subsequent installs must use `npm ci`.

## Dockerfile best practices

- Copy only `package.json` and `package-lock.json` first, run `npm ci`, then copy the rest of the source. This preserves Docker layer caching and speeds up builds.

## Consistency checklist

- `package.json` should not contain floating versions (no `^` or `~`).
- `package-lock.json` must be committed and kept in sync with `package.json`.
- CI/build scripts should use `npm ci` exclusively.

Thank you for helping keep the project deterministic and reliable!
