#!/usr/bin/env node
/**
 * qiick standards: the legacy web platform ratchet (Node 22+, no dependencies).
 *
 * The source is qiick-io/app-ui `standards/scripts/check-legacy-web.mjs`. In a
 * repo with `qiick-standards.json` the sync writes this copy and CI fails when
 * it differs; elsewhere, keep it in step with the source by hand.
 *
 *     node scripts/check-legacy-web.mjs [--baseline <file>] [--update] [<dir>…]
 *
 * Runs Google Chrome's `legacy-scan` (`modern-web-guidance`, Apache-2.0, no
 * dependencies) over the frontend roots given as arguments, and ratchets its
 * findings against `legacy-scan-baseline.json`.
 *
 * The scanner always exits 0, findings or not: this script is the gate. A
 * finding is keyed by rule and file, never by line, so an edit above a finding
 * does not churn the baseline; a new file and a new rule are still caught. CI
 * fails when a file holds more findings of a rule than the baseline allows (or
 * is not in it at all), and when it holds fewer — paid debt is removed from the
 * baseline with `--update`, so it cannot come back unnoticed.
 *
 * The scanner version is pinned in `SCANNER` below and recorded in each
 * baseline: `@latest` would turn every repo red the day Chrome adds a rule.
 * To bump it: change `SCANNER` here, sync the pack, then re-run each repo with
 * `--update` and review the new findings in that pull request.
 *
 * The scanner's own output calls its findings provisional (deterministic rules
 * for 38 of ~200 guides, about 20% of the corpus). Before fixing one, read the
 * guide and check the finding against its Keep/Drop criteria:
 *
 *     npx modern-web-guidance retrieve <guideId>
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The pinned scanner. Never `@latest`: a new rule would fail every repo's CI. */
const SCANNER = 'modern-web-guidance@1.0.1';
const DEFAULT_BASELINE = 'legacy-scan-baseline.json';

/**
 * @param {string} name
 * @param {string} [fallback]
 */
function option(name, fallback) {
    const index = process.argv.indexOf(`--${name}`);

    return index === -1 ? fallback : process.argv[index + 1];
}

/**
 * The directories to scan: every argument that is not an option or its value.
 * @returns {string[]} Defaults to the repo root
 */
function targetDirectories() {
    const directories = [];

    for (let index = 2; index < process.argv.length; index++) {
        const argument = process.argv[index];

        if (argument === '--baseline') {
            index++;
            continue;
        }

        if (!argument.startsWith('--')) {
            directories.push(argument);
        }
    }

    return directories.length > 0 ? directories : ['.'];
}

/**
 * `legacy-scan --json` over one directory.
 * @param {string} directory
 * @returns {{ targetDir: string, totalFindings: number, activeRuleCount?: number, activeGuideCount?: number, guides?: unknown[] }}
 */
function scan(directory) {
    const report = execFileSync(
        'npx',
        ['--yes', SCANNER, 'legacy-scan', directory, '--json'],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );

    return JSON.parse(report);
}

/**
 * Findings per rule and file, the file relative to the repo root: a line number
 * moves with any edit above it, a rule and a file do not.
 * @param {{ targetDir?: string, guides?: { rules?: { ruleId: string, findings?: { file: string }[] }[] }[] }} report
 * @returns {Record<string, Record<string, number>>} Rule => file => count
 */
export function countFindings(report) {
    /** @type {Record<string, Record<string, number>>} */
    const counts = {};
    const root = report.targetDir ?? '.';

    for (const guide of report.guides ?? []) {
        for (const rule of guide.rules ?? []) {
            for (const finding of rule.findings ?? []) {
                const file = path.posix
                    .normalize(path.posix.join(root, finding.file))
                    .replace(/^\.\//, '');

                counts[rule.ruleId] ??= {};
                counts[rule.ruleId][file] =
                    (counts[rule.ruleId][file] ?? 0) + 1;
            }
        }
    }

    return counts;
}

/**
 * @param {Record<string, Record<string, number>>} target - Mutated
 * @param {Record<string, Record<string, number>>} addition
 */
export function mergeCounts(target, addition) {
    for (const [ruleId, files] of Object.entries(addition)) {
        target[ruleId] ??= {};

        for (const [file, count] of Object.entries(files)) {
            target[ruleId][file] = (target[ruleId][file] ?? 0) + count;
        }
    }

    return target;
}

/**
 * Rules and files in a stable order, so a baseline diff only shows real change.
 * @param {Record<string, Record<string, number>>} counts
 */
export function sortCounts(counts) {
    return Object.fromEntries(
        Object.entries(counts)
            .sort(([first], [second]) => first.localeCompare(second))
            .map(([ruleId, files]) => [
                ruleId,
                Object.fromEntries(
                    Object.entries(files).sort(([first], [second]) =>
                        first.localeCompare(second),
                    ),
                ),
            ]),
    );
}

/**
 * @param {Record<string, Record<string, number>>} counts - Findings now
 * @param {Record<string, Record<string, number>>} baseline - Findings allowed
 * @returns {string[]} Errors
 */
export function compareWithBaseline(counts, baseline) {
    /** @type {string[]} */
    const errors = [];
    const ruleIds = [
        ...new Set([...Object.keys(baseline), ...Object.keys(counts)]),
    ].sort();

    for (const ruleId of ruleIds) {
        const allowedFiles = baseline[ruleId] ?? {};
        const foundFiles = counts[ruleId] ?? {};
        const files = [
            ...new Set([
                ...Object.keys(allowedFiles),
                ...Object.keys(foundFiles),
            ]),
        ].sort();

        for (const file of files) {
            const allowed = allowedFiles[file] ?? 0;
            const found = foundFiles[file] ?? 0;

            if (found > allowed) {
                errors.push(
                    `${file}: ${found} ${ruleId} (baseline ${allowed}). Read the guide and check it against the Keep/Drop criteria: npx ${SCANNER} retrieve ${ruleId}`,
                );
            } else if (found < allowed) {
                errors.push(
                    `${file}: ${found} ${ruleId}, the baseline still allows ${allowed}: lower it with --update, so the paid debt cannot come back.`,
                );
            }
        }
    }

    return errors;
}

/**
 * @param {string} baselinePath
 * @returns {{ scanner?: string, findings: Record<string, Record<string, number>> }}
 */
function readBaseline(baselinePath) {
    if (!fs.existsSync(baselinePath)) {
        return { findings: {} };
    }

    const parsed = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

    return { scanner: parsed.scanner, findings: parsed.findings ?? {} };
}

/**
 * The baseline as it is committed: the scanner that measured it, then the
 * findings it allows, keyed by rule and file.
 * @param {Record<string, Record<string, number>>} counts
 */
export function renderBaseline(counts) {
    return `${JSON.stringify(
        { scanner: SCANNER, findings: sortCounts(counts) },
        null,
        4,
    )}\n`;
}

/**
 * @param {Record<string, Record<string, number>>} counts
 */
const totalFindings = (counts) =>
    Object.values(counts)
        .flatMap((files) => Object.values(files))
        .reduce((sum, count) => sum + count, 0);

function main() {
    const baselinePath = option('baseline', DEFAULT_BASELINE);
    const directories = targetDirectories();
    /** @type {Record<string, Record<string, number>>} */
    const counts = {};
    /** @type {{ activeRuleCount?: number, activeGuideCount?: number } | undefined} */
    let coverage;

    for (const directory of directories) {
        if (!fs.existsSync(directory)) {
            console.error(`check-legacy-web: ${directory} does not exist.`);
            process.exit(1);
        }

        const report = scan(directory);

        mergeCounts(counts, countFindings(report));
        coverage ??= report;
    }

    if (process.argv.includes('--update')) {
        fs.writeFileSync(baselinePath, renderBaseline(counts));
        console.log(
            `check-legacy-web: wrote ${baselinePath} (${totalFindings(counts)} findings, ${SCANNER}).`,
        );

        return;
    }

    const baseline = readBaseline(baselinePath);

    console.log(
        `check-legacy-web: ${totalFindings(counts)} findings in ${directories.join(', ')}, baseline allows ${totalFindings(baseline.findings)} (${SCANNER}).`,
    );

    if (coverage?.activeRuleCount) {
        console.log(
            `Deterministic rules only: ${coverage.activeRuleCount} rules over ${coverage.activeGuideCount} guides, about a fifth of the guidance corpus. The scanner calls its findings provisional, so check one against its guide's Keep/Drop criteria before fixing it.`,
        );
    }

    if (baseline.scanner !== undefined && baseline.scanner !== SCANNER) {
        console.error(
            `\n${baselinePath} was measured with ${baseline.scanner}, the pinned scanner is ${SCANNER}. Bumping the pin is deliberate: re-run with --update and review the new findings in that pull request.`,
        );
        process.exit(1);
    }

    const errors = compareWithBaseline(counts, baseline.findings);

    if (errors.length > 0) {
        console.error(
            `\n${errors.join('\n')}\n\nThe scanner's findings are provisional: fix what the guide's Keep criteria confirm, and never widen ${baselinePath} to get green.`,
        );
        process.exit(1);
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main();
}
