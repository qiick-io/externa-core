#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(root, '../..');
const input = resolve(repoRoot, 'resources/openapi/public-cms-v1.yaml');
const output = resolve(root, 'src/generated/openapi.ts');

const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['openapi-typescript', input, '-o', output],
  { cwd: root, stdio: 'inherit', env: process.env },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`Wrote ${output}`);
