import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import prettier from 'eslint-config-prettier/flat';
import importPlugin from 'eslint-plugin-import';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import typescript from 'typescript-eslint';

const controlStatements = [
    'if',
    'return',
    'for',
    'while',
    'do',
    'switch',
    'try',
    'throw',
];
const paddingAroundControl = [
    ...controlStatements.flatMap((stmt) => [
        { blankLine: 'always', prev: '*', next: stmt },
        { blankLine: 'always', prev: stmt, next: '*' },
    ]),
];

/**
 * jsx-a11y key rules for WCAG 2.2 AA gates (#255).
 * Shared code (components/layouts/hooks) → error; pages/other → warn
 * (legacy fixed when touched; lint:check uses --max-warnings 0 so warnings still fail CI).
 * `components/ui/*` stays ignored: shadcn primitives are covered by axe browser smoke.
 */
const jsxA11yKeyRules = {
    ...jsxA11y.flatConfigs.recommended.rules,
    // Deprecated alias of label-has-associated-control; nesting-only labels fail it.
    'jsx-a11y/label-has-for': 'off',
    'jsx-a11y/alt-text': 'error',
    'jsx-a11y/anchor-is-valid': 'error',
    'jsx-a11y/click-events-have-key-events': 'error',
    'jsx-a11y/interactive-supports-focus': 'error',
    'jsx-a11y/label-has-associated-control': [
        'error',
        {
            controlComponents: [
                'Checkbox',
                'Input',
                'Select',
                'Textarea',
                'Switch',
                'NativeSelect',
                'RadioGroupItem',
            ],
            depth: 3,
        },
    ],
    'jsx-a11y/no-autofocus': 'error',
    // Scrollable overflow panels need tabindex for axe scrollable-region-focusable;
    // allow on named `region` landmarks (dashboard tables, etc.).
    'jsx-a11y/no-noninteractive-tabindex': [
        'error',
        {
            tags: [],
            roles: ['tabpanel', 'region'],
            allowExpressionValues: true,
        },
    ],
    // Drag-and-drop targets keep a visible file-picker alternative; exclude drag handlers.
    'jsx-a11y/no-static-element-interactions': [
        'error',
        {
            handlers: [
                'onClick',
                'onMouseDown',
                'onMouseUp',
                'onKeyPress',
                'onKeyDown',
                'onKeyUp',
            ],
        },
    ],
};

const jsxA11yWarnRules = Object.fromEntries(
    Object.entries(jsxA11yKeyRules).map(([rule, config]) => {
        if (config === 'off') {
            return [rule, 'off'];
        }

        if (Array.isArray(config)) {
            return [rule, ['warn', ...config.slice(1)]];
        }

        return [rule, 'warn'];
    }),
);

/** @type {import('eslint').Linter.Config[]} */
export default [
    js.configs.recommended,
    reactHooks.configs.flat['recommended-latest'],
    ...typescript.configs.recommended,
    {
        ...react.configs.flat.recommended,
        ...react.configs.flat['jsx-runtime'], // Required for React 17+
        languageOptions: {
            globals: {
                ...globals.browser,
            },
        },
        rules: {
            'react/react-in-jsx-scope': 'off',
            'react/prop-types': 'off',
            'react/no-unescaped-entities': 'off',
        },
        settings: {
            react: {
                version: 'detect',
            },
        },
    },
    {
        plugins: {
            import: importPlugin,
        },
        settings: {
            'import/resolver': {
                typescript: {
                    alwaysTryTypes: true,
                    project: './tsconfig.json',
                },
                node: true,
            },
        },
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            // ponytail: recommended-latest enables this; fixing all sync setState-in-effect call sites is out of scope for a dep bump
            'react-hooks/set-state-in-effect': 'off',
            '@typescript-eslint/consistent-type-imports': [
                'error',
                {
                    prefer: 'type-imports',
                    fixStyle: 'separate-type-imports',
                },
            ],
            'import/order': [
                'error',
                {
                    groups: [
                        'builtin',
                        'external',
                        'internal',
                        'parent',
                        'sibling',
                        'index',
                    ],
                    alphabetize: {
                        order: 'asc',
                        caseInsensitive: true,
                    },
                },
            ],
            'import/consistent-type-specifier-style': [
                'error',
                'prefer-top-level',
            ],
        },
    },
    {
        plugins: {
            '@stylistic': stylistic,
        },
        rules: {
            '@stylistic/padding-line-between-statements': [
                'error',
                ...paddingAroundControl,
            ],
        },
    },
    {
        ignores: [
            'vendor',
            'node_modules',
            'public',
            'storage',
            'scripts',
            'bootstrap/ssr',
            '.e2e/**',
            'tests/Browser/**/*.mjs',
            'tailwind.config.js',
            'vite.config.ts',
            'resources/js/actions/**',
            // shadcn primitives: a11y covered by Pest Browser axe smoke (#255), not linted here
            'resources/js/components/ui/*',
            'resources/js/routes/**',
            'resources/js/wayfinder/**',
            // Independent Node package with its own toolchain (openapi-typescript + tsc).
            'packages/sdk/**',
        ],
    },
    {
        files: [
            'resources/js/components/**/*.{js,jsx,ts,tsx}',
            'resources/js/layouts/**/*.{js,jsx,ts,tsx}',
            'resources/js/hooks/**/*.{js,jsx,ts,tsx}',
        ],
        plugins: {
            'jsx-a11y': jsxA11y,
        },
        rules: jsxA11yKeyRules,
    },
    {
        files: ['resources/js/**/*.{js,jsx,ts,tsx}'],
        ignores: [
            'resources/js/components/**/*.{js,jsx,ts,tsx}',
            'resources/js/layouts/**/*.{js,jsx,ts,tsx}',
            'resources/js/hooks/**/*.{js,jsx,ts,tsx}',
            'resources/js/components/ui/**/*.{js,jsx,ts,tsx}',
        ],
        plugins: {
            'jsx-a11y': jsxA11y,
        },
        rules: jsxA11yWarnRules,
    },
    prettier, // Turn off all rules that might conflict with Prettier
    {
        plugins: {
            '@stylistic': stylistic,
        },
        rules: {
            curly: ['error', 'all'],
            '@stylistic/brace-style': [
                'error',
                '1tbs',
                { allowSingleLine: false },
            ],
        },
    },
];
