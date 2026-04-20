#!/usr/bin/env node
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { argv } from "node:process";

// Usage: node copyfile.mjs <src> <dest>

const [, , src, dest] = argv;

if (!src || !dest) {
  console.error("Usage: copyfile <src> <dest>");
  process.exit(1);
}

// Ensure destination directory exists
mkdirSync(dirname(dest), { recursive: true });

// Copy file
copyFileSync(src, dest);
