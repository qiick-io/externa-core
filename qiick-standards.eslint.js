/**
 * qiick standards: ESLint flat config for kebab-case frontend file names and the
 * ratcheted code rules.
 *
 * Generated from qiick-io/app-ui `standards/eslint/qiick-standards.eslint.js` by
 * `scripts/sync-standards.mjs`; CI fails when this copy differs. No dependency: the
 * file-name rule is a local plugin, the others are core ESLint and typescript-eslint
 * rules (the app already loads typescript-eslint). CI enforces the file names without
 * ESLint too (the standards check), so that config only brings the error into the editor.
 *
 * In `eslint.config.js`:
 *
 *     import qiickStandards, { qiickRatchetedRules } from './qiick-standards.eslint.js';
 *
 *     export default [
 *         ...otherConfigs,
 *         qiickStandards(['resources/js/**\/*.{ts,tsx}']),
 *         ...qiickRatchetedRules(['resources/js/**\/*.{ts,tsx}']),
 *     ];
 *
 * The ratcheted rules are off in a normal `eslint` run, so an existing app does not turn
 * red; `QIICK_RATCHET=1` turns them on for the ratchet, which fails when a file gets more
 * findings than its entry in `qiick-lint-baseline.json`:
 *
 *     QIICK_RATCHET=1 eslint resources/js --format json | node scripts/qiick-ratchet.mjs lint \
 *         --rule no-restricted-imports,no-restricted-properties,@typescript-eslint/naming-convention,id-length \
 *         --baseline qiick-lint-baseline.json
 */

const kebabCaseFileName =
    /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

/** @type {import('eslint').Rule.RuleModule} */
const filenameCaseRule = {
    meta: {
        type: 'problem',
        docs: {
            description:
                'Frontend files are kebab-case on disk (qiick code standard, Casing).',
        },
        messages: {
            notKebabCase:
                '"{{fileName}}" is not kebab-case. Rename it (e.g. user-menu.tsx).',
        },
        schema: [],
    },
    create(context) {
        return {
            Program(node) {
                const fileName = context.filename.split(/[\\/]/).pop() ?? '';

                if (!kebabCaseFileName.test(fileName)) {
                    context.report({
                        node,
                        messageId: 'notKebabCase',
                        data: { fileName },
                    });
                }
            },
        };
    },
};

/**
 * @param {string[]} files - Globs of the frontend files to check
 * @returns {import('eslint').Linter.Config}
 */
export default function qiickStandards(files) {
    return {
        files,
        plugins: {
            qiick: { rules: { 'filename-case': filenameCaseRule } },
        },
        rules: {
            'qiick/filename-case': 'error',
        },
    };
}

/** The rules `qiickRatchetedRules` adds, in the order the ratchet command lists them. */
export const qiickRatchetedRuleIds = [
    'no-restricted-imports',
    'no-restricted-properties',
    '@typescript-eslint/naming-convention',
    'id-length',
];

const booleanPrefixes = ['is', 'has', 'can', 'should'];

/**
 * Prose rules of the qiick standards turned into lint rules: only `lucide-react`
 * icons and shadcn primitives, toasts through `@/lib/toast`, the clipboard through
 * `@/lib/clipboard`, boolean names with `is` / `has` / `can` / `should`, no
 * single-letter names (`i`, `j`, `k`, `t` and `_` aside).
 *
 * Off unless `QIICK_RATCHET=1`: they run through the ratchet, never as plain lint
 * errors, so adopting them never breaks an app. Boolean names need type
 * information, so the ratchet run uses the TypeScript project service.
 *
 * @param {string[]} files - Globs of the frontend files to check
 * @returns {import('eslint').Linter.Config[]}
 */
export function qiickRatchetedRules(files) {
    // Through globalThis: ESLint configs run in Node, but apps lint this file with browser globals.
    const isRatchetRun = globalThis.process?.env.QIICK_RATCHET === '1';
    const severity = isRatchetRun ? 'warn' : 'off';

    return [
        {
            files,
            // Tests are usually outside the TypeScript project the type-aware rule needs.
            ignores: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
            ...(isRatchetRun
                ? {
                      languageOptions: {
                          parserOptions: { projectService: true },
                      },
                  }
                : {}),
            rules: {
                'no-restricted-imports': [
                    severity,
                    {
                        paths: [
                            {
                                name: 'sonner',
                                message:
                                    'Toasts go through @/lib/toast (docs/notifications.md).',
                            },
                        ],
                        patterns: [
                            {
                                group: [
                                    '@headlessui/*',
                                    '@heroicons/*',
                                    'react-icons',
                                    'react-icons/*',
                                    '@fortawesome/*',
                                    '@tabler/icons-react',
                                    '@phosphor-icons/*',
                                    '@mui/*',
                                    'antd',
                                    '@chakra-ui/*',
                                    '@mantine/*',
                                    'react-toastify',
                                    'react-hot-toast',
                                ],
                                message:
                                    'shadcn primitives and lucide-react icons only (qiick UI, hard rule 3).',
                            },
                        ],
                    },
                ],
                'no-restricted-properties': [
                    severity,
                    {
                        object: 'navigator',
                        property: 'clipboard',
                        message:
                            'Use copyTextToClipboard() / readTextFromClipboard() from @/lib/clipboard (fallback for non-secure contexts).',
                    },
                ],
                '@typescript-eslint/naming-convention': [
                    severity,
                    // Destructured names come from a contract (props such as
                    // `open` / `disabled`, `useState` tuples named after them).
                    {
                        selector: ['variable', 'parameter'],
                        modifiers: ['destructured'],
                        types: ['boolean'],
                        format: null,
                    },
                    {
                        selector: ['variable', 'parameter'],
                        types: ['boolean'],
                        format: ['PascalCase'],
                        prefix: booleanPrefixes,
                    },
                ],
                'id-length': [
                    severity,
                    {
                        min: 2,
                        exceptions: ['i', 'j', 'k', 't', '_'],
                        properties: 'never',
                    },
                ],
            },
        },
        {
            // The wrappers themselves.
            files: ['**/lib/toast.ts', '**/components/ui/sonner.tsx'],
            rules: { 'no-restricted-imports': 'off' },
        },
        {
            files: ['**/lib/clipboard.ts'],
            rules: { 'no-restricted-properties': 'off' },
        },
    ];
}
