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
 * @param {import('estree').Node | null | undefined} node
 * @returns {import('estree').Node[]}
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
 * @param {import('estree').Node} node
 * @returns {string}
 */
function textOf(node) {
    if (node.type === 'TemplateLiteral') {
        return node.quasis.map((quasi) => quasi.value.cooked ?? '').join('');
    }

    return String(node.value);
}

/**
 * @param {import('estree').Property['key']} key
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

/** @type {import('eslint').Rule.RuleModule} */
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
         * @param {import('estree').Node} valueNode
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

export default {
    meta: { name: 'externa' },
    rules: { 'no-literal-ui-prop': noLiteralUiProp },
};
