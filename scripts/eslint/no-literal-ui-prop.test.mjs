// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, it } from 'vite-plus/test';
import { isTranslatableText } from './no-literal-ui-prop.mjs';

/**
 * Runs externa's lint plugin through Oxlint itself (the way `vp lint` loads it),
 * on one temporary file per case, and counts the diagnostics of each rule.
 */
const pluginPath = fileURLToPath(
    new URL('./no-literal-ui-prop.mjs', import.meta.url),
);
const oxlintBinary = fileURLToPath(
    new URL('../../node_modules/.bin/oxlint', import.meta.url),
);

const literalCases = {
    valid: [
        "<Head title={t('nav.users')} />",
        "<Input placeholder={t('common.search')} />",
        '<Input placeholder="https://example.com" />',
        '<Input placeholder="email@example.com" />',
        '<Input placeholder="posts, pages" />',
        '<Input placeholder="my-field" />',
        '<Input placeholder="{{title}} — #{{id}}" />',
        '<div className="Flex Grow" data-state="Open" />',
        "const crumbs = [{ title: t('nav.users'), href: '/users' }];",
        // Objects without `href` are not nav items.
        "const option = { value: 'a', title: 'Draft' };",
    ],
    invalid: [
        ['<Head title="Users" />', 1],
        ['<SelectValue placeholder="Sort" />', 1],
        ['<Button aria-label={open ? "Collapse" : "Expand"} />', 2],
        ['<Checkbox aria-label={`Select item ${id}`} />', 1],
        ['<ConfirmDialog confirmLabel="Publish" />', 1],
        ['<Alert title={error || "Something went wrong"} />', 1],
        ["const crumbs = [{ title: 'Users', href: users.index.url() }];", 1],
        ["const item = { title: `Item #${id}`, href: '/items' };", 1],
    ],
};

const adminPathCases = {
    valid: [
        'const href = users.index.url();',
        "const href = '/collections/1';",
        "const label = 'users';",
    ],
    invalid: [
        "const href = '/users';",
        "const href = '/users/42/edit';",
        "const href = '/settings/api-keys';",
    ],
};

let directory = '';
/** @type {Map<string, Map<string, number>>} rule counts per file name */
const countsByFile = new Map();

function fileFor(group, kind, index) {
    return `${group}-${kind}-${index}.tsx`;
}

beforeAll(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'externa-lint-'));
    const files = [];

    for (const [group, cases] of Object.entries({
        literal: {
            valid: literalCases.valid,
            invalid: literalCases.invalid.map(([code]) => code),
        },
        adminPath: adminPathCases,
    })) {
        for (const kind of ['valid', 'invalid']) {
            cases[kind].forEach((code, index) => {
                const name = fileFor(group, kind, index);
                const source = code.startsWith('<')
                    ? `export const Probe = () => ${code};\n`
                    : `${code}\n`;
                writeFileSync(path.join(directory, name), source);
                files.push(name);
            });
        }
    }

    const configPath = path.join(directory, '.oxlintrc.json');
    writeFileSync(
        configPath,
        JSON.stringify({
            plugins: [],
            jsPlugins: [pluginPath],
            rules: {
                'externa/no-literal-ui-prop': 'error',
                'externa/no-hard-coded-admin-path': 'error',
            },
        }),
    );

    let output = '';

    try {
        output = execFileSync(
            oxlintBinary,
            ['-c', configPath, '-f', 'json', ...files],
            { cwd: directory, encoding: 'utf8' },
        );
    } catch (error) {
        // Oxlint exits non-zero when it reports errors; the JSON is still on stdout.
        output = error.stdout;
    }

    for (const diagnostic of JSON.parse(output).diagnostics ?? []) {
        const name = path.basename(diagnostic.filename);
        const counts = countsByFile.get(name) ?? new Map();
        counts.set(diagnostic.code, (counts.get(diagnostic.code) ?? 0) + 1);
        countsByFile.set(name, counts);
    }
});

afterAll(() => {
    rmSync(directory, { recursive: true, force: true });
});

function countOf(name, code) {
    return countsByFile.get(name)?.get(code) ?? 0;
}

describe('externa/no-literal-ui-prop', () => {
    it('accepts translated text, identifiers, URLs and non-nav objects', ({
        expect,
    }) => {
        literalCases.valid.forEach((code, index) => {
            expect(
                countOf(
                    fileFor('literal', 'valid', index),
                    'externa(no-literal-ui-prop)',
                ),
                code,
            ).toBe(0);
        });
    });

    it('reports hard-coded text in UI props and nav items', ({ expect }) => {
        literalCases.invalid.forEach(([code, expected], index) => {
            expect(
                countOf(
                    fileFor('literal', 'invalid', index),
                    'externa(no-literal-ui-prop)',
                ),
                code,
            ).toBe(expected);
        });
    });
});

describe('externa/no-hard-coded-admin-path', () => {
    it('reports hard-coded admin paths and accepts the rest', ({ expect }) => {
        adminPathCases.valid.forEach((code, index) => {
            expect(
                countOf(
                    fileFor('adminPath', 'valid', index),
                    'externa(no-hard-coded-admin-path)',
                ),
                code,
            ).toBe(0);
        });
        adminPathCases.invalid.forEach((code, index) => {
            expect(
                countOf(
                    fileFor('adminPath', 'invalid', index),
                    'externa(no-hard-coded-admin-path)',
                ),
                code,
            ).toBe(1);
        });
    });
});

describe('isTranslatableText', () => {
    it('treats words as text and identifiers, URLs and examples as not', ({
        expect,
    }) => {
        expect(isTranslatableText('Production')).toBe(true);
        expect(isTranslatableText('Search fields…')).toBe(true);
        expect(isTranslatableText('thumbnail')).toBe(false);
        expect(isTranslatableText('png, jpg, pdf')).toBe(false);
        expect(isTranslatableText('/api/v1/files')).toBe(false);
        expect(isTranslatableText('[{"name":"caption"}]')).toBe(false);
        expect(isTranslatableText('—')).toBe(false);
    });
});
