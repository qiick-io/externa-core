#!/usr/bin/env node
/**
 * Fails when a key read with env('KEY') in config/ is neither documented in `.env.example`
 * (as `KEY=` or commented `# KEY=`) nor listed in `scripts/env-example-stock-keys.txt`.
 *
 * Why: `.env.example` is the reference self-hosters copy, so every Externa setting must be
 * there (#291). Stock framework and package settings (session, Pulse, Lighthouse, Reverb, …)
 * keep their upstream defaults and are listed once in the stock file instead of padding the
 * example. A stock key that is later documented must leave the stock file (stale entries fail).
 *
 * Usage: node scripts/check-env-example.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const repositoryRoot = new URL('..', import.meta.url).pathname;

/** @param {string} directory @returns {string[]} */
function listPhpFiles(directory) {
    return readdirSync(directory).flatMap((entryName) => {
        const entryPath = join(directory, entryName);

        if (statSync(entryPath).isDirectory()) {
            return listPhpFiles(entryPath);
        }

        return entryName.endsWith('.php') ? [entryPath] : [];
    });
}

const configKeys = new Set();

for (const configFile of listPhpFiles(join(repositoryRoot, 'config'))) {
    for (const match of readFileSync(configFile, 'utf8').matchAll(
        /env\(\s*'([A-Z0-9_]+)'/g,
    )) {
        configKeys.add(match[1]);
    }
}

const documentedKeys = new Set(
    [
        ...readFileSync(join(repositoryRoot, '.env.example'), 'utf8').matchAll(
            /^#?\s*([A-Z][A-Z0-9_]*)=/gm,
        ),
    ].map((match) => match[1]),
);

const stockKeys = new Set(
    readFileSync(
        join(repositoryRoot, 'scripts/env-example-stock-keys.txt'),
        'utf8',
    )
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '' && !line.startsWith('#')),
);

const undocumentedKeys = [...configKeys]
    .filter((key) => !documentedKeys.has(key) && !stockKeys.has(key))
    .sort();
const staleStockKeys = [...stockKeys]
    .filter((key) => documentedKeys.has(key) || !configKeys.has(key))
    .sort();

if (undocumentedKeys.length > 0) {
    console.error(
        `check-env-example: ${undocumentedKeys.length} config env() key(s) missing from .env.example:\n  ${undocumentedKeys.join('\n  ')}\n` +
            'Document each one in .env.example (commented with its default is fine), or, for a stock framework / package key, add it to scripts/env-example-stock-keys.txt.',
    );
}

if (staleStockKeys.length > 0) {
    console.error(
        `check-env-example: ${staleStockKeys.length} stale key(s) in scripts/env-example-stock-keys.txt (documented in .env.example or no longer read by config/):\n  ${staleStockKeys.join('\n  ')}`,
    );
}

if (undocumentedKeys.length > 0 || staleStockKeys.length > 0) {
    process.exit(1);
}

console.log(
    `check-env-example: ok (${configKeys.size} keys, ${stockKeys.size} stock)`,
);
