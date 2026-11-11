import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import laravel from 'laravel-vite-plugin';
import { exec } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { defineConfig, type Plugin, type PluginContext } from 'vite';
import { lazyPlugins } from 'vite-plus';

const execAsync = promisify(exec);

function resolvePhpBinary(): string {
    const herdPhp84 = path.join(
        os.homedir(),
        'Library/Application Support/Herd/bin/php84',
    );

    if (existsSync(herdPhp84)) {
        return herdPhp84;
    }

    return 'php';
}

function isWayfinderWatchedFile(file: string, root: string): boolean {
    const normalizedFile = file.replaceAll('\\', '/');
    const normalizedRoot = root.replaceAll('\\', '/');

    if (
        normalizedFile.startsWith(`${normalizedRoot}/routes/`) &&
        normalizedFile.endsWith('.php')
    ) {
        return true;
    }

    return (
        normalizedFile.startsWith(`${normalizedRoot}/app/`) &&
        normalizedFile.includes('/Http/') &&
        normalizedFile.endsWith('.php')
    );
}

function wayfinderVite8(command: string): Plugin {
    const generated = 'actions, routes, form variants';

    const runCommand = async (context: PluginContext) => {
        try {
            await execAsync(command);
        } catch (error) {
            context.error(`Error generating Wayfinder types: ${String(error)}`);
        }

        context.info(`Types generated for ${generated}`);
    };

    return {
        name: 'externa:wayfinder-vite8',
        enforce: 'pre',
        async buildStart() {
            await runCommand(this);
        },
        async hotUpdate({ file }) {
            if (this.environment.name !== 'client') {
                return;
            }

            // ponytail: Vite 8's mixed-environment handleHotUpdate compat path is
            // brittle here; run Wayfinder once from the client environment instead.
            if (isWayfinderWatchedFile(file, this.environment.config.root)) {
                await runCommand(this);
            }
        },
    };
}

// Optional Laravel Herd HTTPS: set HERD_SITE to your Valet/Herd hostname
// (e.g. my-app.test) when using `herd secure`. Unset → Vite stays on HTTP.
const herdSite = process.env.HERD_SITE?.trim() || '';
const herdCertDir = path.join(
    os.homedir(),
    'Library/Application Support/Herd/config/valet/Certificates',
);
const herdTlsHost =
    herdSite !== '' && existsSync(path.join(herdCertDir, `${herdSite}.crt`))
        ? herdSite
        : false;

export default defineConfig({
    lint: {
        plugins: ['oxc', 'typescript', 'unicorn', 'react', 'import'],
        jsPlugins: [
            '@stylistic/eslint-plugin',
            {
                name: 'vite-plus',
                specifier: 'vite-plus/oxlint-plugin',
            },
        ],
        categories: {
            correctness: 'warn',
        },
        env: {
            builtin: true,
            browser: true,
        },
        ignorePatterns: [
            'vendor',
            'node_modules',
            'public',
            'storage',
            'scripts',
            'bootstrap/ssr',
            '.e2e/**',
            '.claude/**',
            'tests/Browser/**/*.mjs',
            'tailwind.config.js',
            'vite.config.ts',
            'resources/js/actions/**',
            'resources/js/components/ui/*',
            'resources/js/routes/**',
            'resources/js/wayfinder/**',
            'packages/sdk/**',
        ],
        rules: {
            'constructor-super': 'error',
            'for-direction': 'error',
            'getter-return': 'error',
            'no-async-promise-executor': 'error',
            'no-case-declarations': 'error',
            'no-class-assign': 'error',
            'no-compare-neg-zero': 'error',
            'no-cond-assign': 'error',
            'no-const-assign': 'error',
            'no-constant-binary-expression': 'error',
            'no-constant-condition': 'error',
            'no-control-regex': 'error',
            'no-debugger': 'error',
            'no-delete-var': 'error',
            'no-dupe-class-members': 'error',
            'no-dupe-else-if': 'error',
            'no-dupe-keys': 'error',
            'no-duplicate-case': 'error',
            'no-empty': 'error',
            'no-empty-character-class': 'error',
            'no-empty-pattern': 'error',
            'no-empty-static-block': 'error',
            'no-ex-assign': 'error',
            'no-extra-boolean-cast': 'error',
            'no-fallthrough': 'error',
            'no-func-assign': 'error',
            'no-global-assign': 'error',
            'no-import-assign': 'error',
            'no-invalid-regexp': 'error',
            'no-irregular-whitespace': 'error',
            'no-loss-of-precision': 'error',
            'no-misleading-character-class': 'error',
            'no-new-native-nonconstructor': 'error',
            'no-nonoctal-decimal-escape': 'error',
            'no-obj-calls': 'error',
            'no-prototype-builtins': 'error',
            'no-redeclare': 'error',
            'no-regex-spaces': 'error',
            'no-self-assign': 'error',
            'no-setter-return': 'error',
            'no-shadow-restricted-names': 'error',
            'no-sparse-arrays': 'error',
            'no-this-before-super': 'error',
            'no-undef': 'error',
            'no-unexpected-multiline': 'error',
            'no-unreachable': 'error',
            'no-unsafe-finally': 'error',
            'no-unsafe-negation': 'error',
            'no-unsafe-optional-chaining': 'error',
            'no-unused-labels': 'error',
            'no-unused-private-class-members': 'error',
            'no-unused-vars': 'error',
            'no-useless-backreference': 'error',
            'no-useless-catch': 'error',
            'no-useless-escape': 'error',
            'no-with': 'error',
            'require-yield': 'error',
            'use-isnan': 'error',
            'valid-typeof': 'error',
            'no-array-constructor': 'error',
            'no-unused-expressions': 'error',
            'import/consistent-type-specifier-style': [
                'error',
                'prefer-top-level',
            ],
            '@stylistic/padding-line-between-statements': [
                'error',
                {
                    blankLine: 'always',
                    prev: '*',
                    next: 'if',
                },
                {
                    blankLine: 'always',
                    prev: 'if',
                    next: '*',
                },
                {
                    blankLine: 'always',
                    prev: '*',
                    next: 'return',
                },
                {
                    blankLine: 'always',
                    prev: 'return',
                    next: '*',
                },
                {
                    blankLine: 'always',
                    prev: '*',
                    next: 'for',
                },
                {
                    blankLine: 'always',
                    prev: 'for',
                    next: '*',
                },
                {
                    blankLine: 'always',
                    prev: '*',
                    next: 'while',
                },
                {
                    blankLine: 'always',
                    prev: 'while',
                    next: '*',
                },
                {
                    blankLine: 'always',
                    prev: '*',
                    next: 'do',
                },
                {
                    blankLine: 'always',
                    prev: 'do',
                    next: '*',
                },
                {
                    blankLine: 'always',
                    prev: '*',
                    next: 'switch',
                },
                {
                    blankLine: 'always',
                    prev: 'switch',
                    next: '*',
                },
                {
                    blankLine: 'always',
                    prev: '*',
                    next: 'try',
                },
                {
                    blankLine: 'always',
                    prev: 'try',
                    next: '*',
                },
                {
                    blankLine: 'always',
                    prev: '*',
                    next: 'throw',
                },
                {
                    blankLine: 'always',
                    prev: 'throw',
                    next: '*',
                },
            ],
            '@stylistic/brace-style': [
                'error',
                '1tbs',
                {
                    allowSingleLine: false,
                },
            ],
            'react/rules-of-hooks': 'error',
            'react/static-components': 'error',
            'react/use-memo': 'error',
            'react/void-use-memo': 'error',
            'react/preserve-manual-memoization': 'error',
            'react/immutability': 'error',
            'react/globals': 'error',
            'react/refs': 'error',
            // ponytail: was off in ESLint too (react-hooks/set-state-in-effect); 47 sync setState-in-effect call sites to refactor first.
            'react/set-state-in-effect': 'off',
            'react/error-boundaries': 'error',
            'react/purity': 'error',
            'react/set-state-in-render': 'error',
            'react/unsupported-syntax': 'warn',
            'typescript/ban-ts-comment': 'error',
            'typescript/no-duplicate-enum-values': 'error',
            'typescript/no-empty-object-type': 'error',
            'typescript/no-explicit-any': 'error',
            'typescript/no-extra-non-null-assertion': 'error',
            'typescript/no-misused-new': 'error',
            'typescript/no-namespace': 'error',
            'typescript/no-non-null-asserted-optional-chain': 'error',
            'typescript/no-require-imports': 'error',
            'typescript/no-this-alias': 'error',
            'typescript/no-unnecessary-type-constraint': 'error',
            'typescript/no-unsafe-declaration-merging': 'error',
            'typescript/no-unsafe-function-type': 'error',
            'typescript/no-wrapper-object-types': 'error',
            'typescript/prefer-as-const': 'error',
            'typescript/prefer-namespace-keyword': 'error',
            'typescript/triple-slash-reference': 'error',
            'typescript/consistent-type-imports': [
                'error',
                {
                    prefer: 'type-imports',
                    fixStyle: 'separate-type-imports',
                },
            ],
            'vite-plus/prefer-vite-plus-imports': 'error',
            // ponytail: rules ESLint never ran here, new with Oxlint's type-aware and React Compiler
            // checks (204 findings at the switch). Off until fixed and turned on one by one in
            // externa-core#671, so this PR changes the toolchain and not the code.
            'typescript/no-base-to-string': 'off',
            'jsx-a11y/prefer-tag-over-role': 'off',
            'jsx-a11y/role-has-required-aria-props': 'off',
        },
        overrides: [
            {
                files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
                rules: {
                    'constructor-super': 'off',
                    'getter-return': 'off',
                    'no-class-assign': 'off',
                    'no-const-assign': 'off',
                    'no-dupe-class-members': 'off',
                    'no-dupe-keys': 'off',
                    'no-func-assign': 'off',
                    'no-import-assign': 'off',
                    'no-new-native-nonconstructor': 'off',
                    'no-obj-calls': 'off',
                    'no-redeclare': 'off',
                    'no-setter-return': 'off',
                    'no-this-before-super': 'off',
                    'no-undef': 'off',
                    'no-unreachable': 'off',
                    'no-unsafe-negation': 'off',
                    'no-var': 'error',
                    'no-with': 'off',
                    'prefer-const': 'error',
                    'prefer-rest-params': 'error',
                    'prefer-spread': 'error',
                },
            },
            {
                files: [
                    'resources/js/components/**/*.{js,jsx,ts,tsx}',
                    'resources/js/layouts/**/*.{js,jsx,ts,tsx}',
                    'resources/js/hooks/**/*.{js,jsx,ts,tsx}',
                ],
                rules: {
                    'jsx-a11y/alt-text': 'error',
                    'jsx-a11y/anchor-ambiguous-text': 'off',
                    'jsx-a11y/anchor-has-content': 'error',
                    'jsx-a11y/anchor-is-valid': 'error',
                    'jsx-a11y/aria-activedescendant-has-tabindex': 'error',
                    'jsx-a11y/aria-props': 'error',
                    'jsx-a11y/aria-proptypes': 'error',
                    'jsx-a11y/aria-role': 'error',
                    'jsx-a11y/aria-unsupported-elements': 'error',
                    'jsx-a11y/autocomplete-valid': 'error',
                    'jsx-a11y/click-events-have-key-events': 'error',
                    'jsx-a11y/control-has-associated-label': 'off',
                    'jsx-a11y/heading-has-content': 'error',
                    'jsx-a11y/html-has-lang': 'error',
                    'jsx-a11y/iframe-has-title': 'error',
                    'jsx-a11y/img-redundant-alt': 'error',
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
                    'jsx-a11y/media-has-caption': 'error',
                    'jsx-a11y/mouse-events-have-key-events': 'error',
                    'jsx-a11y/no-access-key': 'error',
                    'jsx-a11y/no-autofocus': 'error',
                    'jsx-a11y/no-distracting-elements': 'error',
                    'jsx-a11y/no-interactive-element-to-noninteractive-role': [
                        'error',
                        {
                            tr: ['none', 'presentation'],
                            canvas: ['img'],
                        },
                    ],
                    'jsx-a11y/no-noninteractive-element-interactions': [
                        'error',
                        {
                            handlers: [
                                'onClick',
                                'onError',
                                'onLoad',
                                'onMouseDown',
                                'onMouseUp',
                                'onKeyPress',
                                'onKeyDown',
                                'onKeyUp',
                            ],
                            alert: ['onKeyUp', 'onKeyDown', 'onKeyPress'],
                            body: ['onError', 'onLoad'],
                            dialog: ['onKeyUp', 'onKeyDown', 'onKeyPress'],
                            iframe: ['onError', 'onLoad'],
                            img: ['onError', 'onLoad'],
                        },
                    ],
                    'jsx-a11y/no-noninteractive-element-to-interactive-role': [
                        'error',
                        {
                            ul: [
                                'listbox',
                                'menu',
                                'menubar',
                                'radiogroup',
                                'tablist',
                                'tree',
                                'treegrid',
                            ],
                            ol: [
                                'listbox',
                                'menu',
                                'menubar',
                                'radiogroup',
                                'tablist',
                                'tree',
                                'treegrid',
                            ],
                            li: [
                                'menuitem',
                                'menuitemradio',
                                'menuitemcheckbox',
                                'option',
                                'row',
                                'tab',
                                'treeitem',
                            ],
                            table: ['grid'],
                            td: ['gridcell'],
                            fieldset: ['radiogroup', 'presentation'],
                        },
                    ],
                    'jsx-a11y/no-noninteractive-tabindex': [
                        'error',
                        {
                            tags: [],
                            roles: ['tabpanel', 'region'],
                            allowExpressionValues: true,
                        },
                    ],
                    'jsx-a11y/no-redundant-roles': 'error',
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
                    'jsx-a11y/role-has-required-aria-props': 'error',
                    'jsx-a11y/role-supports-aria-props': 'error',
                    'jsx-a11y/scope': 'error',
                    'jsx-a11y/tabindex-no-positive': 'error',
                },
                plugins: ['jsx-a11y'],
            },
            {
                files: ['resources/js/**/*.{js,jsx,ts,tsx}'],
                rules: {
                    'jsx-a11y/alt-text': 'warn',
                    'jsx-a11y/anchor-ambiguous-text': 'off',
                    'jsx-a11y/anchor-has-content': 'warn',
                    'jsx-a11y/anchor-is-valid': 'warn',
                    'jsx-a11y/aria-activedescendant-has-tabindex': 'warn',
                    'jsx-a11y/aria-props': 'warn',
                    'jsx-a11y/aria-proptypes': 'warn',
                    'jsx-a11y/aria-role': 'warn',
                    'jsx-a11y/aria-unsupported-elements': 'warn',
                    'jsx-a11y/autocomplete-valid': 'warn',
                    'jsx-a11y/click-events-have-key-events': 'warn',
                    'jsx-a11y/control-has-associated-label': 'off',
                    'jsx-a11y/heading-has-content': 'warn',
                    'jsx-a11y/html-has-lang': 'warn',
                    'jsx-a11y/iframe-has-title': 'warn',
                    'jsx-a11y/img-redundant-alt': 'warn',
                    'jsx-a11y/interactive-supports-focus': 'warn',
                    'jsx-a11y/label-has-associated-control': [
                        'warn',
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
                    'jsx-a11y/media-has-caption': 'warn',
                    'jsx-a11y/mouse-events-have-key-events': 'warn',
                    'jsx-a11y/no-access-key': 'warn',
                    'jsx-a11y/no-autofocus': 'warn',
                    'jsx-a11y/no-distracting-elements': 'warn',
                    'jsx-a11y/no-interactive-element-to-noninteractive-role': [
                        'warn',
                        {
                            tr: ['none', 'presentation'],
                            canvas: ['img'],
                        },
                    ],
                    'jsx-a11y/no-noninteractive-element-interactions': [
                        'warn',
                        {
                            handlers: [
                                'onClick',
                                'onError',
                                'onLoad',
                                'onMouseDown',
                                'onMouseUp',
                                'onKeyPress',
                                'onKeyDown',
                                'onKeyUp',
                            ],
                            alert: ['onKeyUp', 'onKeyDown', 'onKeyPress'],
                            body: ['onError', 'onLoad'],
                            dialog: ['onKeyUp', 'onKeyDown', 'onKeyPress'],
                            iframe: ['onError', 'onLoad'],
                            img: ['onError', 'onLoad'],
                        },
                    ],
                    'jsx-a11y/no-noninteractive-element-to-interactive-role': [
                        'warn',
                        {
                            ul: [
                                'listbox',
                                'menu',
                                'menubar',
                                'radiogroup',
                                'tablist',
                                'tree',
                                'treegrid',
                            ],
                            ol: [
                                'listbox',
                                'menu',
                                'menubar',
                                'radiogroup',
                                'tablist',
                                'tree',
                                'treegrid',
                            ],
                            li: [
                                'menuitem',
                                'menuitemradio',
                                'menuitemcheckbox',
                                'option',
                                'row',
                                'tab',
                                'treeitem',
                            ],
                            table: ['grid'],
                            td: ['gridcell'],
                            fieldset: ['radiogroup', 'presentation'],
                        },
                    ],
                    'jsx-a11y/no-noninteractive-tabindex': [
                        'warn',
                        {
                            tags: [],
                            roles: ['tabpanel', 'region'],
                            allowExpressionValues: true,
                        },
                    ],
                    'jsx-a11y/no-redundant-roles': 'warn',
                    'jsx-a11y/no-static-element-interactions': [
                        'warn',
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
                    'jsx-a11y/role-has-required-aria-props': 'warn',
                    'jsx-a11y/role-supports-aria-props': 'warn',
                    'jsx-a11y/scope': 'warn',
                    'jsx-a11y/tabindex-no-positive': 'warn',
                },
                plugins: ['jsx-a11y'],
            },
            {
                // externa's own rules (scripts/eslint/no-literal-ui-prop.mjs): UI props and nav
                // items go through t() (the i18next rule only sees JSX text), and admin paths
                // come from Wayfinder.
                files: ['resources/js/**/*.{ts,tsx}'],
                jsPlugins: ['./scripts/eslint/no-literal-ui-prop.mjs'],
                rules: {
                    'externa/no-literal-ui-prop': 'error',
                    'externa/no-hard-coded-admin-path': 'error',
                },
            },
            {
                files: [
                    'resources/js/**/*.{test,spec}.{ts,tsx}',
                    'resources/js/test/**',
                ],
                jsPlugins: ['./scripts/eslint/no-literal-ui-prop.mjs'],
                rules: {
                    'externa/no-literal-ui-prop': 'off',
                },
            },
            {
                // Registry copy of the AI Elements code block (@qiick, drift-checked): it must stay
                // byte-identical to upstream, so its fire-and-forget highlight promise is not edited here.
                files: ['resources/js/components/ai-elements/code-block.tsx'],
                rules: {
                    'typescript/no-floating-promises': 'off',
                },
            },
            {
                // Last, so it wins over the jsx-a11y overrides above (see the ponytail in `rules`).
                files: ['**/*'],
                rules: {
                    'jsx-a11y/prefer-tag-over-role': 'off',
                    'jsx-a11y/role-has-required-aria-props': 'off',
                },
                plugins: ['jsx-a11y'],
            },
        ],
        options: {
            // As excubia-app: type-aware rules, warnings fail. Type errors come from `npm run types:check` (tsc).
            denyWarnings: true,
            typeAware: true,
        },
    },
    fmt: {
        semi: true,
        singleQuote: true,
        singleAttributePerLine: false,
        htmlWhitespaceSensitivity: 'css',
        printWidth: 80,
        tabWidth: 4,
        sortPackageJson: false,
        sortTailwindcss: {
            stylesheet: 'resources/css/app.css',
            functions: ['clsx', 'cn', 'cva'],
        },
        overrides: [
            {
                files: ['**/*.yml'],
                options: {
                    tabWidth: 2,
                },
            },
        ],
        ignorePatterns: [
            'resources/js/components/ui/*',
            'resources/views/mail/*',
            'resources/css/shadcn-tailwind.css',
            '.qiick/',
            // Registry items (app-ui) that Oxfmt would reorder; the drift check keeps them in sync.
            'resources/js/components/admin/data-table.tsx',
            'resources/js/lib/ai-message-parts.ts',
        ],
    },
    plugins: lazyPlugins(() => [
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.tsx'],
            ssr: 'resources/js/ssr.tsx',
            refresh: true,
            // Herd `secure` → hot URL https://{HERD_SITE}:5173 (not 127.0.0.1).
            detectTls: herdTlsHost,
        }),
        react({
            babel: {
                plugins: ['babel-plugin-react-compiler'],
            },
        }),
        tailwindcss(),
        wayfinderVite8(
            `"${resolvePhpBinary()}" artisan wayfinder:generate --with-form`,
        ),
    ]),
    server: {
        host: '127.0.0.1',
        port: 5173,
        strictPort: true,
    },
});
