#!/usr/bin/env node
/**
 * WCAG 2.2 AA contrast gate for admin theme tokens (#255).
 *
 * Reads palette + semantic tokens from resources/css/app.css and checks the
 * pairs documented in docs/a11y-contrast-pairs.md for light, dark,
 * high-contrast, and high-contrast dark. Default brand (teal) only —
 * project --brand-primary overrides are validated in settings (#243).
 *
 * Thresholds: text ≥4.5:1, UI/border/focus ≥3:1.
 *
 * Usage: node scripts/a11y-contrast.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cssPath = path.join(root, 'resources/css/app.css');
const css = fs.readFileSync(cssPath, 'utf8');

/** @type {Record<string, string>} */
const palette = {};

for (const match of css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\b/g)) {
    palette[`--color-${match[1]}`] = normalizeHex(match[2]);
}

palette['#ffffff'] = '#ffffff';
palette['#000000'] = '#000000';

/**
 * @param {string} block
 * @returns {Record<string, string>}
 */
function parseTokenBlock(block) {
    /** @type {Record<string, string>} */
    const tokens = {};

    for (const match of block.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
        tokens[`--${match[1]}`] = match[2].trim();
    }

    return tokens;
}

/**
 * Extract the first top-level CSS ruleset body for `selector`.
 * @param {string} selector
 */
function extractBlock(selector) {
    const needle = `${selector} {`;
    const start = css.indexOf(needle);

    if (start === -1) {
        throw new Error(`Missing ruleset ${selector} in ${cssPath}`);
    }

    let i = start + needle.length;
    let depth = 1;

    while (i < css.length && depth > 0) {
        const ch = css[i];

        if (ch === '{') {
            depth += 1;
        } else if (ch === '}') {
            depth -= 1;
        }

        i += 1;
    }

    return css.slice(start + needle.length, i - 1);
}

const light = parseTokenBlock(extractBlock(':root'));
const dark = { ...light, ...parseTokenBlock(extractBlock('.dark')) };
const highContrast = {
    ...light,
    ...parseTokenBlock(extractBlock('html.high-contrast')),
};
const highContrastDark = {
    ...dark,
    ...parseTokenBlock(extractBlock('html.high-contrast.dark')),
};

/**
 * @param {string} hex
 */
function normalizeHex(hex) {
    let value = hex.trim().replace(/^#/, '');

    if (value.length === 3) {
        value = value
            .split('')
            .map((ch) => ch + ch)
            .join('');
    }

    if (value.length === 8) {
        value = value.slice(0, 6);
    }

    return `#${value.toLowerCase()}`;
}

/**
 * Split top-level comma args inside a `var(...)` body (respects nesting).
 * @param {string} body
 * @returns {string[]}
 */
function splitVarArgs(body) {
    /** @type {string[]} */
    const parts = [];
    let depth = 0;
    let current = '';

    for (const ch of body) {
        if (ch === '(') {
            depth += 1;
            current += ch;
            continue;
        }

        if (ch === ')') {
            depth -= 1;
            current += ch;
            continue;
        }

        if (ch === ',' && depth === 0) {
            parts.push(current.trim());
            current = '';
            continue;
        }

        current += ch;
    }

    if (current.trim() !== '') {
        parts.push(current.trim());
    }

    return parts;
}

/**
 * Resolve a token value to a solid hex (default brand; no --brand-primary).
 * @param {string} value
 * @param {Record<string, string>} tokens
 * @param {number} depth
 */
function resolveHex(value, tokens, depth = 0) {
    if (depth > 12) {
        throw new Error(`Token resolution too deep: ${value}`);
    }

    const trimmed = value.replace(/\s+/g, ' ').trim();

    if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) {
        return normalizeHex(trimmed);
    }

    // var(--a, var(--b, fallback)) or var(--a, #fff) — may be multi-line in CSS.
    const varMatch = trimmed.match(/^var\((.*)\)$/i);

    if (varMatch) {
        const args = splitVarArgs(varMatch[1]);
        const name = args[0]?.trim();
        const fallback = args.slice(1).join(',').trim();

        if (!name || !name.startsWith('--')) {
            throw new Error(`Invalid var() name in: ${value}`);
        }

        // Prefer palette / defined tokens; skip unresolved brand overrides.
        if (Object.hasOwn(palette, name)) {
            return palette[name];
        }

        if (Object.hasOwn(tokens, name)) {
            try {
                return resolveHex(tokens[name], tokens, depth + 1);
            } catch {
                // fall through to fallback (e.g. unset --brand-primary*)
            }
        }

        if (fallback) {
            return resolveHex(fallback, tokens, depth + 1);
        }

        throw new Error(`Unresolved custom property ${name}`);
    }

    throw new Error(`Cannot resolve color value: ${value}`);
}

/**
 * @param {string} hex
 * @returns {[number, number, number]}
 */
function hexToRgb(hex) {
    const value = normalizeHex(hex).slice(1);

    return [
        Number.parseInt(value.slice(0, 2), 16) / 255,
        Number.parseInt(value.slice(2, 4), 16) / 255,
        Number.parseInt(value.slice(4, 6), 16) / 255,
    ];
}

/**
 * @param {number} channel
 */
function toLinear(channel) {
    return channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
}

/**
 * @param {string} hex
 */
function relativeLuminance(hex) {
    const [r, g, b] = hexToRgb(hex);

    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * @param {string} foreground
 * @param {string} background
 */
function contrastRatio(foreground, background) {
    const l1 = relativeLuminance(foreground);
    const l2 = relativeLuminance(background);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);

    return (lighter + 0.05) / (darker + 0.05);
}

/**
 * @typedef {{ name: string, fg: string, bg: string, need: number }} Pair
 */

/** @type {Record<string, { tokens: Record<string, string>, pairs: Pair[] }>} */
const modes = {
    light: {
        tokens: light,
        pairs: [
            { name: 'foreground / background', fg: '--foreground', bg: '--background', need: 4.5 },
            { name: 'muted-foreground / background', fg: '--muted-foreground', bg: '--background', need: 4.5 },
            { name: 'muted-foreground / card', fg: '--muted-foreground', bg: '--card', need: 4.5 },
            { name: 'primary-foreground / primary', fg: '--primary-foreground', bg: '--primary', need: 4.5 },
            { name: 'destructive-foreground / destructive', fg: '--destructive-foreground', bg: '--destructive', need: 4.5 },
            { name: 'success-foreground / success', fg: '--success-foreground', bg: '--success', need: 4.5 },
            { name: 'warning-foreground / warning', fg: '--warning-foreground', bg: '--warning', need: 4.5 },
            { name: 'info-foreground / info', fg: '--info-foreground', bg: '--info', need: 4.5 },
            { name: 'input / background (UI)', fg: '--input', bg: '--background', need: 3.0 },
            { name: 'ring / background (focus)', fg: '--ring', bg: '--background', need: 3.0 },
            { name: 'sidebar-foreground / sidebar', fg: '--sidebar-foreground', bg: '--sidebar', need: 4.5 },
        ],
    },
    dark: {
        tokens: dark,
        pairs: [
            { name: 'foreground / background', fg: '--foreground', bg: '--background', need: 4.5 },
            { name: 'muted-foreground / background', fg: '--muted-foreground', bg: '--background', need: 4.5 },
            { name: 'muted-foreground / card', fg: '--muted-foreground', bg: '--card', need: 4.5 },
            { name: 'primary-foreground / primary', fg: '--primary-foreground', bg: '--primary', need: 4.5 },
            { name: 'destructive-foreground / destructive', fg: '--destructive-foreground', bg: '--destructive', need: 4.5 },
            { name: 'success-foreground / success', fg: '--success-foreground', bg: '--success', need: 4.5 },
            { name: 'warning-foreground / warning', fg: '--warning-foreground', bg: '--warning', need: 4.5 },
            { name: 'info-foreground / info', fg: '--info-foreground', bg: '--info', need: 4.5 },
            { name: 'input / background (UI)', fg: '--input', bg: '--background', need: 3.0 },
            { name: 'ring / background (focus)', fg: '--ring', bg: '--background', need: 3.0 },
        ],
    },
    'high-contrast': {
        tokens: highContrast,
        pairs: [
            { name: 'foreground / background', fg: '--foreground', bg: '--background', need: 4.5 },
            { name: 'muted-foreground / background', fg: '--muted-foreground', bg: '--background', need: 4.5 },
            { name: 'input / background (UI)', fg: '--input', bg: '--background', need: 3.0 },
            { name: 'ring / background (focus)', fg: '--ring', bg: '--background', need: 3.0 },
        ],
    },
    'high-contrast-dark': {
        tokens: highContrastDark,
        pairs: [
            { name: 'foreground / background', fg: '--foreground', bg: '--background', need: 4.5 },
            { name: 'muted-foreground / background', fg: '--muted-foreground', bg: '--background', need: 4.5 },
            { name: 'input / background (UI)', fg: '--input', bg: '--background', need: 3.0 },
            { name: 'ring / background (focus)', fg: '--ring', bg: '--background', need: 3.0 },
        ],
    },
};

let failures = 0;

for (const [mode, { tokens, pairs }] of Object.entries(modes)) {
    console.log(`\n[${mode}]`);

    for (const pair of pairs) {
        const fgValue = tokens[pair.fg];
        const bgValue = tokens[pair.bg];

        if (!fgValue || !bgValue) {
            console.error(`  FAIL  ${pair.name}: missing token ${!fgValue ? pair.fg : pair.bg}`);
            failures += 1;
            continue;
        }

        try {
            const fgHex = resolveHex(fgValue, tokens);
            const bgHex = resolveHex(bgValue, tokens);
            const ratio = contrastRatio(fgHex, bgHex);
            const ok = ratio + 1e-9 >= pair.need;
            const line = `  ${ok ? 'PASS' : 'FAIL'}  ${pair.name}: ${ratio.toFixed(2)}:1 (need ${pair.need}:1) [${fgHex} on ${bgHex}]`;

            if (ok) {
                console.log(line);
            } else {
                console.error(line);
                failures += 1;
            }
        } catch (error) {
            console.error(`  FAIL  ${pair.name}: ${error instanceof Error ? error.message : error}`);
            failures += 1;
        }
    }
}

if (failures > 0) {
    console.error(`\na11y contrast: ${failures} pair(s) below WCAG 2.2 AA.`);
    process.exit(1);
}

console.log('\na11y contrast: all pairs pass WCAG 2.2 AA.');
