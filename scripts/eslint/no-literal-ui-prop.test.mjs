import { RuleTester } from 'eslint';
import typescript from 'typescript-eslint';
import { afterAll, describe, it } from 'vitest';
import { isTranslatableText, noLiteralUiProp } from './no-literal-ui-prop.mjs';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
    languageOptions: {
        parser: typescript.parser,
        parserOptions: { ecmaFeatures: { jsx: true } },
    },
});

ruleTester.run('no-literal-ui-prop', noLiteralUiProp, {
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
        {
            code: '<Head title="Users" />',
            errors: [{ messageId: 'literal' }],
        },
        {
            code: '<SelectValue placeholder="Sort" />',
            errors: [{ messageId: 'literal' }],
        },
        {
            code: '<Button aria-label={open ? "Collapse" : "Expand"} />',
            errors: [{ messageId: 'literal' }, { messageId: 'literal' }],
        },
        {
            code: '<Checkbox aria-label={`Select item ${id}`} />',
            errors: [{ messageId: 'literal' }],
        },
        {
            code: '<ConfirmDialog confirmLabel="Publish" />',
            errors: [{ messageId: 'literal' }],
        },
        {
            code: '<Alert title={error || "Something went wrong"} />',
            errors: [{ messageId: 'literal' }],
        },
        {
            code: "const crumbs = [{ title: 'Users', href: users.index.url() }];",
            errors: [{ messageId: 'literal' }],
        },
        {
            code: "const item = { title: `Item #${id}`, href: '/items' };",
            errors: [{ messageId: 'literal' }],
        },
    ],
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
