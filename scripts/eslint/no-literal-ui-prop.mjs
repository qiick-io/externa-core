/**
 * ESLint rule `externa/no-literal-ui-prop`: flags hard-coded, human-readable
 * strings in the props and objects that put text on screen, so they go through
 * `t('…')` like JSX text does (`i18next/no-literal-string`, jsx-text-only).
 *
 * Checked:
 * - JSX attributes named in {@link UI_PROPS} (`title`, `label`, `placeholder`,
 *   `aria-label`, `confirmLabel`, …), including string branches of `?:`,
 *   `||` / `??` and static template literals inside `{…}`;
 * - `title` / `label` / `description` keys of object literals that also carry
 *   an `href` (breadcrumbs, nav items).
 *
 * Not flagged: machine-readable examples that are the same in every language
 * (URLs, paths, e-mail addresses, `{{tokens}}`, JSON, lowercase identifiers and
 * comma lists of them, such as `posts, pages` or `my-field`).
 */

/** JSX props whose string value is shown to (or announced for) the user. */
export const UI_PROPS = new Set([
    'title',
    'label',
    'placeholder',
    'aria-label',
    'aria-description',
    'aria-roledescription',
    'aria-valuetext',
    'alt',
    'confirmLabel',
    'cancelLabel',
    'description',
    'tooltip',
    'emptyMessage',
    'emptyText',
    'heading',
    'subtitle',
]);

/** Object keys checked on `{ …, href }` items (breadcrumbs, nav items). */
const NAV_ITEM_KEYS = new Set(['title', 'label', 'description']);

/**
 * Whether a string reads as text a translator would translate.
 *
 * @param {string} value
 * @returns {boolean}
 */
export function isTranslatableText(value) {
    const text = value.trim();

    if (!/\p{L}/u.test(text)) {
        return false;
    }

    if (
        /:\/\//.test(text) ||
        text.startsWith('/') ||
        text.includes('@') ||
        text.includes('{{') ||
        /^[[{]/.test(text)
    ) {
        return false;
    }

    // Lowercase identifiers, file extensions, hosts and comma lists of them.
    if (/^[\p{Ll}0-9_.\-/*, ]+$/u.test(text)) {
        return false;
    }

    return true;
}

/**
 * Collects the string literals a value expression can evaluate to.
 *
 * @param {object | null | undefined} node ESTree node
 * @returns {object[]} ESTree nodes
 */
function literalBranches(node) {
    if (!node) {
        return [];
    }

    switch (node.type) {
        case 'Literal':
            return typeof node.value === 'string' ? [node] : [];
        case 'TemplateLiteral':
            return node.quasis.some((quasi) =>
                isTranslatableText(quasi.value.cooked ?? ''),
            )
                ? [node]
                : [];
        case 'JSXExpressionContainer':
            return literalBranches(node.expression);
        case 'ConditionalExpression':
            return [
                ...literalBranches(node.consequent),
                ...literalBranches(node.alternate),
            ];
        case 'LogicalExpression':
            return literalBranches(node.right);
        case 'TSAsExpression':
        case 'TSSatisfiesExpression':
            return literalBranches(node.expression);
        default:
            return [];
    }
}

/**
 * @param {object} node ESTree node
 * @returns {string}
 */
function textOf(node) {
    if (node.type === 'TemplateLiteral') {
        return node.quasis.map((quasi) => quasi.value.cooked ?? '').join('');
    }

    return String(node.value);
}

/**
 * @param {object} key ESTree property key
 * @returns {string | null}
 */
function keyName(key) {
    if (key.type === 'Identifier') {
        return key.name;
    }

    if (key.type === 'Literal' && typeof key.value === 'string') {
        return key.value;
    }

    return null;
}

/** An ESLint-compatible rule, loaded by Oxlint as a JS plugin. */
export const noLiteralUiProp = {
    meta: {
        type: 'problem',
        docs: {
            description:
                'Disallow hard-coded text in UI props and breadcrumb / nav items; use t().',
        },
        schema: [],
        messages: {
            literal:
                'Hard-coded UI text in `{{name}}`: "{{text}}". Use t(\'…\') with en/it/de keys.',
        },
    },
    create(context) {
        /**
         * @param {object} valueNode ESTree node
         * @param {string} name
         */
        function check(valueNode, name) {
            for (const literal of literalBranches(valueNode)) {
                const text = textOf(literal);

                if (isTranslatableText(text)) {
                    context.report({
                        node: literal,
                        messageId: 'literal',
                        data: { name, text: text.trim().slice(0, 60) },
                    });
                }
            }
        }

        return {
            JSXAttribute(node) {
                const name =
                    node.name.type === 'JSXIdentifier' ? node.name.name : null;

                if (name && UI_PROPS.has(name)) {
                    check(node.value, name);
                }
            },
            ObjectExpression(node) {
                const properties = node.properties.filter(
                    (property) => property.type === 'Property',
                );
                const isNavItem = properties.some(
                    (property) => keyName(property.key) === 'href',
                );

                if (!isNavItem) {
                    return;
                }

                for (const property of properties) {
                    const name = keyName(property.key);

                    if (name && NAV_ITEM_KEYS.has(name)) {
                        check(property.value, name);
                    }
                }
            },
        };
    },
};

/** Admin paths that must come from Wayfinder (`@/routes/...`), never a string (#284). */
export const HARD_CODED_ADMIN_PATH =
    /^\/(users|groups|files|activity-logs|settings\/(roles|api-keys|permissions))(\/|$)/;

/**
 * Disallow hard-coded admin paths in string literals. ESLint ran this as a
 * `no-restricted-syntax` selector, which Oxlint does not implement.
 *
 * An ESLint-compatible rule, loaded by Oxlint as a JS plugin.
 */
export const noHardCodedAdminPath = {
    meta: {
        type: 'problem',
        docs: {
            description:
                'Disallow hard-coded admin paths; use the Wayfinder route helpers.',
        },
        schema: [],
        messages: {
            path: 'Use Wayfinder route helpers (@/routes/...) instead of hard-coded admin paths.',
        },
    },
    create(context) {
        return {
            Literal(node) {
                if (
                    typeof node.value === 'string' &&
                    HARD_CODED_ADMIN_PATH.test(node.value)
                ) {
                    context.report({ node, messageId: 'path' });
                }
            },
        };
    },
};

export default {
    meta: { name: 'externa' },
    rules: {
        'no-literal-ui-prop': noLiteralUiProp,
        'no-hard-coded-admin-path': noHardCodedAdminPath,
    },
};
