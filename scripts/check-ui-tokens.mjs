#!/usr/bin/env node
/**
 * Guardrail for #240: flag arbitrary sub-scale font sizes, raw Tailwind palette
 * utilities, and #hex colors in className outside resources/js/components/ui.
 *
 * - Arbitrary `text-[Npx|Nrem|Nem]` → hard fail (must use text-xs… scale).
 * - Raw palette / #hex → fail when a new path:kind:token appears or its count
 *   grows vs scripts/ui-token-baseline.txt (pay down debt; do not grow it).
 * - Stale baseline → fail when a baselined count is higher than what the scan
 *   finds. The baseline is a ratchet: once debt is paid it must be removed, so a
 *   later revert (e.g. `text-orange-700` coming back on the sidebar AI item via a
 *   stale squash, #452) fails instead of hiding behind leftover allowance.
 *
 * Excludes: components/ui/*, pages/welcome.tsx (starter chrome), app-logo-icon.tsx.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(fileURLToPath(new URL('..', import.meta.url)));
const scanRoot = join(rootDir, 'resources/js');
const baselinePath = join(rootDir, 'scripts/ui-token-baseline.txt');

const EXCLUDE_SUFFIXES = [
    'components/ui/',
    'pages/welcome.tsx',
    'components/app-logo-icon.tsx',
];

const PALETTE =
    /(?<![\w-])(?:bg|text|border|ring|outline|fill|stroke|from|via|to|decoration|accent|caret|divide|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:\d{2,3}|black|white)(?:\/\d{1,3})?(?![\w-])/g;

const HEX = /#[0-9a-fA-F]{3,8}/g;
const TEXT_ARB = /text-\[[0-9.]+(?:px|rem|em)\]/g;

/**
 * @param {string} dir
 * @param {(file: string) => void} visit
 */
function walk(dir, visit) {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        const st = statSync(full);

        if (st.isDirectory()) {
            walk(full, visit);
            continue;
        }

        if (/\.(tsx|ts|jsx|js)$/.test(name)) {
            visit(full);
        }
    }
}

/**
 * @param {string} abs
 */
function isExcluded(abs) {
    const rel = relative(scanRoot, abs).split('\\').join('/');

    return EXCLUDE_SUFFIXES.some(
        (suffix) =>
            rel === suffix || rel.startsWith(suffix) || rel.endsWith(suffix),
    );
}

/**
 * @returns {Map<string, number>}
 */
function loadBaseline() {
    const map = new Map();
    const raw = readFileSync(baselinePath, 'utf8');

    for (const line of raw.split('\n')) {
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }

        const parts = trimmed.split(':');

        if (parts.length < 4) {
            continue;
        }

        const count = Number(parts.at(-1));
        const token = parts.at(-2);
        const kind = parts.at(-3);
        const path = parts.slice(0, -3).join(':');
        const key = `${path}:${kind}:${token}`;

        if (!Number.isFinite(count)) {
            continue;
        }

        map.set(key, count);
    }

    return map;
}

/**
 * @returns {{ text: string[], paletteHex: Map<string, number> }}
 */
function scan() {
    /** @type {string[]} */
    const text = [];
    /** @type {Map<string, number>} */
    const paletteHex = new Map();

    walk(scanRoot, (abs) => {
        if (isExcluded(abs)) {
            return;
        }

        const rel = `resources/js/${relative(scanRoot, abs).split('\\').join('/')}`;
        const source = readFileSync(abs, 'utf8');
        const lines = source.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const stripped = line.trim();

            if (
                stripped.startsWith('//') ||
                stripped.startsWith('*') ||
                stripped.startsWith('/*')
            ) {
                continue;
            }

            for (const m of line.matchAll(TEXT_ARB)) {
                text.push(`${rel}:${i + 1}:${m[0]}`);
            }

            for (const m of line.matchAll(PALETTE)) {
                const key = `${rel}:palette:${m[0]}`;
                paletteHex.set(key, (paletteHex.get(key) ?? 0) + 1);
            }

            if (
                line.includes('className') ||
                line.includes('class=') ||
                line.includes('cn(')
            ) {
                for (const m of line.matchAll(HEX)) {
                    const key = `${rel}:hex:${m[0]}`;
                    paletteHex.set(key, (paletteHex.get(key) ?? 0) + 1);
                }
            }
        }
    });

    return { text, paletteHex };
}

const baseline = loadBaseline();
const { text, paletteHex } = scan();
/** @type {string[]} */
const errors = [];

if (text.length > 0) {
    errors.push(
        'Arbitrary font sizes outside the type scale (use text-xs … text-4xl):',
    );

    for (const hit of text) {
        errors.push(`  ${hit}`);
    }
}

/** @type {string[]} */
const debtGrowth = [];

for (const [key, count] of paletteHex) {
    const allowed = baseline.get(key) ?? 0;

    if (count > allowed) {
        debtGrowth.push(`  ${key} (found ${count}, baseline ${allowed})`);
    }
}

/** @type {string[]} */
const staleBaseline = [];

for (const [key, allowed] of baseline) {
    const count = paletteHex.get(key) ?? 0;

    if (count < allowed) {
        staleBaseline.push(
            count === 0
                ? `  ${key}:${allowed} → remove this line`
                : `  ${key}:${allowed} → lower to ${key}:${count}`,
        );
    }
}

if (debtGrowth.length > 0) {
    errors.push(
        'New or increased raw palette / #hex className usage (use theme tokens; see CONTRIBUTING.md):',
    );
    errors.push(...debtGrowth);
}

if (staleBaseline.length > 0) {
    errors.push(
        'Stale scripts/ui-token-baseline.txt entries (debt was paid; ratchet the baseline down):',
    );
    errors.push(...staleBaseline);
}

if (errors.length > 0) {
    console.error('check-ui-tokens: failed\n');
    console.error(errors.join('\n'));
    process.exit(1);
}

const debtKeys = paletteHex.size;
console.log(
    `check-ui-tokens: ok (0 arbitrary text-[…]; ${debtKeys} baselined palette/#hex keys)`,
);
