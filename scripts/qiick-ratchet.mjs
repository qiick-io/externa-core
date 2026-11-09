#!/usr/bin/env node
/**
 * qiick standards: debt ratchets (Node 20+, no dependencies).
 *
 * Generated from qiick-io/app-ui `standards/scripts/qiick-ratchet.mjs` by
 * `scripts/sync-standards.mjs`; CI fails when this copy differs.
 *
 *     node scripts/qiick-ratchet.mjs phpstan [--baseline phpstan-baseline.neon] [--base origin/develop]
 *
 *   Fails when the PHPStan baseline holds more errors (the sum of its `count:`
 *   entries) than the same file on the base ref: the baseline may only shrink.
 *   The one exception is the PR that raises `level:` in phpstan.neon(.dist):
 *   it may baseline the new level's errors.
 *
 *     <lint --format json> | node scripts/qiick-ratchet.mjs lint --rule <id>[,<id>…] --baseline <file.json> [--update]
 *
 *   Reads an ESLint or oxlint JSON report from stdin and counts the findings of
 *   each rule per file. Fails when a file has more than its baseline count (or is
 *   new), and when a file has fewer (lower the baseline with `--update`, so paid
 *   debt cannot come back). One rule: the baseline maps file => count. Several
 *   rules: it maps rule => file => count.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * @param {string} name
 * @param {string} [fallback]
 */
function option(name, fallback) {
    const index = process.argv.indexOf(`--${name}`);

    return index === -1 ? fallback : process.argv[index + 1];
}

/**
 * @param {string} neon - PHPStan baseline contents
 */
function countBaselineErrors(neon) {
    return [...neon.matchAll(/^\s*count:\s*(\d+)/gm)].reduce(
        (total, match) => total + Number(match[1]),
        0,
    );
}

/**
 * @param {string} ref - Git ref, or '' for the working tree
 * @param {string} file
 * @returns {string | null}
 */
function readAt(ref, file) {
    try {
        return ref === ''
            ? fs.readFileSync(file, 'utf8')
            : execFileSync('git', ['show', `${ref}:${file}`], {
                  encoding: 'utf8',
                  stdio: ['ignore', 'pipe', 'ignore'],
              });
    } catch {
        return null;
    }
}

/**
 * The PHPStan level at a ref (`max` counts as 10).
 * @param {string} ref
 */
function phpstanLevelAt(ref) {
    const config =
        readAt(ref, 'phpstan.neon') ?? readAt(ref, 'phpstan.neon.dist') ?? '';
    const level = config.match(/^\s*level:\s*(\w+)/m)?.[1] ?? '0';

    return level === 'max' ? 10 : Number(level);
}

function checkPhpstan() {
    const baselinePath = option('baseline', 'phpstan-baseline.neon');
    const baseRef =
        option('base') ??
        (process.env.GITHUB_BASE_REF
            ? `origin/${process.env.GITHUB_BASE_REF}`
            : 'origin/develop');
    const current = fs.existsSync(baselinePath)
        ? countBaselineErrors(fs.readFileSync(baselinePath, 'utf8'))
        : 0;
    let previous = 0;

    try {
        previous = countBaselineErrors(
            execFileSync('git', ['show', `${baseRef}:${baselinePath}`], {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore'],
            }),
        );
    } catch {
        // No baseline on the base ref: nothing may be baselined now either.
    }

    console.log(
        `qiick-ratchet phpstan: ${current} baselined errors (${baseRef}: ${previous})`,
    );

    if (current > previous && phpstanLevelAt('') > phpstanLevelAt(baseRef)) {
        console.log(
            `Level raised (${phpstanLevelAt(baseRef)} -> ${phpstanLevelAt('')}): the new level's errors may be baselined once.`,
        );

        return;
    }

    if (current > previous) {
        console.error(
            `\n${baselinePath} grew by ${current - previous}. Fix the new errors instead of baselining them.`,
        );
        process.exit(1);
    }
}

/**
 * @param {string} report - ESLint (`[{ filePath, messages }]`) or oxlint (`{ diagnostics }`) JSON
 * @param {string} ruleId - `i18next/no-literal-string`
 * @returns {Record<string, number>} Path relative to the cwd => count
 */
function countLintFindings(report, ruleId) {
    const parsed = JSON.parse(report);
    /** @type {Record<string, number>} */
    const counts = {};
    const add = (file) => {
        const relativePath = path
            .relative(process.cwd(), path.resolve(file))
            .split(path.sep)
            .join('/');

        counts[relativePath] = (counts[relativePath] ?? 0) + 1;
    };
    // oxlint writes `plugin(rule)`; ESLint writes `plugin/rule`.
    const [plugin, rule] = ruleId.split('/');
    const oxlintCode = `${plugin}(${rule})`;

    if (Array.isArray(parsed)) {
        for (const result of parsed) {
            for (const message of result.messages) {
                if (message.ruleId === ruleId) {
                    add(result.filePath);
                }
            }
        }
    } else {
        for (const diagnostic of parsed.diagnostics ?? []) {
            if (diagnostic.code === oxlintCode) {
                add(diagnostic.filename);
            }
        }
    }

    return Object.fromEntries(
        Object.entries(counts).sort(([first], [second]) =>
            first.localeCompare(second),
        ),
    );
}

/**
 * @param {Record<string, number>} counts - Findings now, file => count
 * @param {Record<string, number>} baseline - Allowed, file => count
 * @param {string} ruleId
 * @returns {string[]} Errors
 */
function compareWithBaseline(counts, baseline, ruleId) {
    /** @type {string[]} */
    const errors = [];

    for (const file of new Set([
        ...Object.keys(baseline),
        ...Object.keys(counts),
    ])) {
        const allowed = baseline[file] ?? 0;
        const found = counts[file] ?? 0;

        if (found > allowed) {
            errors.push(`${file}: ${found} ${ruleId} (baseline ${allowed}).`);
        } else if (found < allowed) {
            errors.push(
                `${file}: ${found} ${ruleId}, baseline still allows ${allowed}: lower it with --update.`,
            );
        }
    }

    return errors;
}

function checkLint() {
    const ruleIds = (option('rule') ?? '').split(',').filter(Boolean);
    const baselinePath = option('baseline');

    if (ruleIds.length === 0 || !baselinePath) {
        throw new Error(
            'lint needs --rule <id>[,<id>…] and --baseline <file.json>.',
        );
    }

    const report = fs.readFileSync(0, 'utf8');
    const isSingleRule = ruleIds.length === 1;
    /** @type {Record<string, Record<string, number>>} */
    const countsByRule = Object.fromEntries(
        ruleIds.map((ruleId) => [ruleId, countLintFindings(report, ruleId)]),
    );

    if (process.argv.includes('--update')) {
        const baseline = isSingleRule ? countsByRule[ruleIds[0]] : countsByRule;

        fs.writeFileSync(
            baselinePath,
            `${JSON.stringify(baseline, null, 4)}\n`,
        );
        console.log(`qiick-ratchet lint: wrote ${baselinePath}`);

        return;
    }

    const storedBaseline = fs.existsSync(baselinePath)
        ? JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
        : {};
    /** @type {string[]} */
    const errors = [];

    for (const ruleId of ruleIds) {
        const counts = countsByRule[ruleId];
        const baseline = isSingleRule
            ? storedBaseline
            : (storedBaseline[ruleId] ?? {});
        const total = Object.values(counts).reduce(
            (sum, count) => sum + count,
            0,
        );

        errors.push(...compareWithBaseline(counts, baseline, ruleId));
        console.log(
            `qiick-ratchet lint: ${total} ${ruleId} findings baselined`,
        );
    }

    if (errors.length > 0) {
        console.error(`\n${errors.join('\n')}`);
        process.exit(1);
    }
}

const mode = process.argv[2];

if (mode === 'phpstan') {
    checkPhpstan();
} else if (mode === 'lint') {
    checkLint();
} else {
    console.error('Usage: qiick-ratchet.mjs phpstan | lint (see the header).');
    process.exit(1);
}
