#!/usr/bin/env node
/**
 * qiick standards: debt ratchets (Node 20+, no dependencies).
 *
 * Generated from qiick-io/app-ui `standards/scripts/qiick-ratchet.mjs` by
 * `scripts/sync-standards.mjs`; CI fails when this copy differs.
 *
 *     node scripts/qiick-ratchet.mjs phpstan [--min-level 8|max] [--baseline phpstan-baseline.neon] [--base origin/develop]
 *
 *   Fails when the PHPStan baseline holds more errors (the sum of its `count:`
 *   entries) than the same file on the base ref: the baseline may only shrink.
 *   The one exception is the PR that raises `level:` in phpstan.neon(.dist):
 *   it may baseline the new level's errors. Also fails when `level:` is lower
 *   than on the base ref, or than `--min-level` (8 for apps, max for packages).
 *
 *     node scripts/qiick-ratchet.mjs coverage --clover <clover.xml> [--floor coverage-floor.txt] [--update] [--base origin/develop]
 *     node scripts/qiick-ratchet.mjs coverage --clover <clover.xml> <path>=<percent>…
 *
 *   Line coverage (`stmt` lines) from a PHPUnit / Pest Clover report. Apps: the
 *   total must reach the committed floor, and the floor may only rise against
 *   the base ref (`--update` writes the current total). Packages: each path
 *   (`src=90`) is a fixed minimum over the report files under it; a path with no
 *   PHP file yet is skipped. From excubia-core's `.github/assert-coverage.php`.
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
 * @param {string} level - `0`…`10` or `max`
 */
const levelNumber = (level) => (level === 'max' ? 10 : Number(level));

/**
 * The PHPStan level at a ref (`max` counts as 10), or null without a config.
 * @param {string} ref
 */
function phpstanLevelAt(ref) {
    const config =
        readAt(ref, 'phpstan.neon') ?? readAt(ref, 'phpstan.neon.dist');

    if (config === null) {
        return null;
    }

    return levelNumber(config.match(/^\s*level:\s*(\w+)/m)?.[1] ?? '0');
}

/**
 * The ref a ratchet compares with: `--base`, the pull request's base branch in
 * GitHub Actions, or `origin/develop`.
 */
function baseRefOption() {
    return (
        option('base') ??
        (process.env.GITHUB_BASE_REF
            ? `origin/${process.env.GITHUB_BASE_REF}`
            : 'origin/develop')
    );
}

function checkPhpstan() {
    const baselinePath = option('baseline', 'phpstan-baseline.neon');
    const baseRef = baseRefOption();
    const minimumLevel = option('min-level');
    const currentLevel = phpstanLevelAt('') ?? 0;
    const baseLevel = phpstanLevelAt(baseRef);

    if (
        minimumLevel !== undefined &&
        currentLevel < levelNumber(minimumLevel)
    ) {
        console.error(
            `PHPStan runs at level ${currentLevel}; the qiick floor here is ${minimumLevel}. Raise \`level:\` (the PR that raises it may baseline the new level's errors once).`,
        );
        process.exit(1);
    }

    if (baseLevel !== null && currentLevel < baseLevel) {
        console.error(
            `PHPStan level dropped (${baseRef}: ${baseLevel}, now ${currentLevel}): the level only rises.`,
        );
        process.exit(1);
    }

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

    if (current > previous && currentLevel > (baseLevel ?? 0)) {
        console.log(
            `Level raised (${baseLevel ?? 0} -> ${currentLevel}): the new level's errors may be baselined once.`,
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

/**
 * Executable (`stmt`) and covered lines per file of a PHPUnit / Pest Clover
 * report. Method lines are not counted, as in PHPUnit's own line coverage.
 * @param {string} clover - Clover XML
 * @returns {{ file: string, executable: number, covered: number }[]}
 */
function readCloverLines(clover) {
    const attribute = (attributes, name) =>
        attributes.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

    return [...clover.matchAll(/<file\b([^>]*)>([\s\S]*?)<\/file>/g)].map(
        ([, fileAttributes, body]) => {
            let executable = 0;
            let covered = 0;

            for (const [, lineAttributes] of body.matchAll(
                /<line\b([^>]*)>/g,
            )) {
                if (attribute(lineAttributes, 'type') !== 'stmt') {
                    continue;
                }

                executable++;

                if (Number(attribute(lineAttributes, 'count') ?? 0) > 0) {
                    covered++;
                }
            }

            return {
                file: (attribute(fileAttributes, 'name') ?? '').replaceAll(
                    '\\',
                    '/',
                ),
                executable,
                covered,
            };
        },
    );
}

/**
 * @param {{ executable: number, covered: number }[]} files
 * @returns {{ executable: number, covered: number, percentage: number }}
 */
function totalCoverage(files) {
    const executable = files.reduce((sum, file) => sum + file.executable, 0);
    const covered = files.reduce((sum, file) => sum + file.covered, 0);

    return {
        executable,
        covered,
        percentage: executable === 0 ? 0 : (covered / executable) * 100,
    };
}

/**
 * Whether the directory holds at least one PHP file at any depth.
 * @param {string} directory
 */
function hasPhpFiles(directory) {
    if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
        return false;
    }

    return fs
        .readdirSync(directory, { recursive: true })
        .some((entry) => String(entry).endsWith('.php'));
}

/**
 * Packages: a fixed minimum per path (`src=90`), over the report files whose
 * path contains `/<path>/`, so `src` includes `src/Checks`.
 * @param {ReturnType<typeof readCloverLines>} files
 * @param {string[]} thresholdArguments - `<path>=<percent>`
 * @returns {string[]} Errors
 */
function checkPathThresholds(files, thresholdArguments) {
    /** @type {string[]} */
    const errors = [];

    for (const thresholdArgument of thresholdArguments) {
        const [, rawPath, threshold] = thresholdArgument.match(
            /^([\w./-]+)=(\d+(?:\.\d+)?)$/,
        );
        const coveragePath = rawPath.replace(/^\/+|\/+$/g, '');

        if (!hasPhpFiles(coveragePath)) {
            console.log(
                `${coveragePath} has no PHP files yet: its coverage minimum is not applied.`,
            );
            continue;
        }

        const total = totalCoverage(
            files.filter((file) => file.file.includes(`/${coveragePath}/`)),
        );

        if (total.executable === 0) {
            errors.push(
                `${coveragePath} has PHP files but the report has no executable lines for them.`,
            );
            continue;
        }

        const summary = `${coveragePath} coverage ${total.percentage.toFixed(1)}% (${total.covered}/${total.executable} lines), minimum ${threshold}%`;

        if (total.percentage < Number(threshold)) {
            errors.push(`${summary}: below the minimum.`);
        } else {
            console.log(`qiick-ratchet coverage: ${summary}.`);
        }
    }

    return errors;
}

/**
 * The first number in a floor file, or null when there is none.
 * @param {string | null} text
 */
function parseFloor(text) {
    const match = text?.match(/\d+(?:\.\d+)?/);

    return match ? Number(match[0]) : null;
}

/**
 * Apps: the total must reach the committed floor, and the floor never drops
 * below the base ref's.
 * @param {ReturnType<typeof readCloverLines>} files
 * @returns {string[]} Errors
 */
function checkFloor(files) {
    const floorPath = option('floor', 'coverage-floor.txt');
    const baseRef = baseRefOption();
    const total = totalCoverage(files);
    // Rounded down, so the floor written by --update is always reached.
    const currentFloor = Math.floor(total.percentage * 10) / 10;

    if (process.argv.includes('--update')) {
        fs.writeFileSync(floorPath, `${currentFloor.toFixed(1)}\n`);
        console.log(
            `qiick-ratchet coverage: wrote ${currentFloor.toFixed(1)} to ${floorPath}`,
        );

        return [];
    }

    const floor = parseFloor(readAt('', floorPath));
    const baseFloor = parseFloor(readAt(baseRef, floorPath));

    if (floor === null) {
        return [
            `${floorPath} is missing: commit the current coverage (${currentFloor.toFixed(1)}) as the floor, with --update.`,
        ];
    }

    console.log(
        `qiick-ratchet coverage: ${total.percentage.toFixed(1)}% (${total.covered}/${total.executable} lines), floor ${floor}% (${baseRef}: ${baseFloor ?? 'none'})`,
    );

    /** @type {string[]} */
    const errors = [];

    if (baseFloor !== null && floor < baseFloor) {
        errors.push(
            `${floorPath} was lowered (${baseFloor} -> ${floor}): the floor only rises.`,
        );
    }

    if (total.percentage < floor) {
        errors.push(
            `Line coverage ${total.percentage.toFixed(1)}% is below the floor ${floor}%: add tests for the new code.`,
        );
    } else if (currentFloor >= floor + 1) {
        console.log(
            `Coverage is ${(currentFloor - floor).toFixed(1)} points above the floor: raise it in this PR with --update.`,
        );
    }

    return errors;
}

function checkCoverage() {
    const cloverPath = option('clover');

    if (!cloverPath) {
        throw new Error('coverage needs --clover <clover.xml>.');
    }

    if (!fs.existsSync(cloverPath)) {
        console.error(
            `${cloverPath} was not found: run Pest with --coverage-clover.`,
        );
        process.exit(1);
    }

    const files = readCloverLines(fs.readFileSync(cloverPath, 'utf8'));
    const thresholdArguments = process.argv
        .slice(3)
        .filter((argument) => /^[\w./-]+=\d+(?:\.\d+)?$/.test(argument));
    const errors =
        thresholdArguments.length > 0
            ? checkPathThresholds(files, thresholdArguments)
            : checkFloor(files);

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
} else if (mode === 'coverage') {
    checkCoverage();
} else {
    console.error(
        'Usage: qiick-ratchet.mjs phpstan | lint | coverage (see the header).',
    );
    process.exit(1);
}
