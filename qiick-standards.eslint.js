/**
 * qiick standards: ESLint flat config for kebab-case frontend file names.
 *
 * Generated from qiick-io/app-ui `standards/eslint/qiick-standards.eslint.js` by
 * `scripts/sync-standards.mjs`; CI fails when this copy differs. No dependency: the
 * rule is a local plugin. CI enforces the same rule without ESLint (the standards
 * check), so this config only brings the error into the editor.
 *
 * In `eslint.config.js`:
 *
 *     import qiickStandards from './qiick-standards.eslint.js';
 *
 *     export default [...otherConfigs, qiickStandards(['resources/js/**\/*.{ts,tsx}'])];
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
