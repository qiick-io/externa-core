#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(root, '../..');
const input = resolve(repoRoot, 'resources/openapi/public-cms-v1.yaml');
const committed = resolve(root, 'src/generated/openapi.ts');

const dir = mkdtempSync(join(tmpdir(), 'externa-sdk-'));
const generated = join(dir, 'openapi.ts');

try {
  const result = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['openapi-typescript', input, '-o', generated],
    { cwd: root, stdio: 'inherit', env: process.env },
  );
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  const a = createHash('sha256').update(readFileSync(committed)).digest('hex');
  const b = createHash('sha256').update(readFileSync(generated)).digest('hex');
  if (a !== b) {
    console.error(
      'packages/sdk/src/generated/openapi.ts is out of date with resources/openapi/public-cms-v1.yaml.\n' +
        'Run: cd packages/sdk && npm run generate',
    );
    process.exit(1);
  }

  console.log('SDK OpenAPI types are fresh.');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
