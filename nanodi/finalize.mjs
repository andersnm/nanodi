#!/usr/bin/env node
// Generates a tiny package.json with a "type" field under dist/esm or dist/cjs.
// In 2026 it is not possible to create a dual-mode package targeting esm and cjs with only tsc and no bundler.

import { stdout } from "node:process";
const type = process.argv[2];
stdout.write(JSON.stringify({ type }, null, 2));
