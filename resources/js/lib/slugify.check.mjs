/**
 * Smoke check for Laravel Str::slug-style helper.
 * Run: node resources/js/lib/slugify.check.mjs
 */

function slugify(value) {
    return value
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replaceAll('@', 'at')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function slugifyInput(value) {
    const keepTrailing = value.length > 0 && /[^A-Za-z0-9]$/.test(value);
    const slug = slugify(value);
    if (keepTrailing && slug !== '') return `${slug}-`;
    return slug;
}

const FIELD_KEY_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

const cases = [
    ['Hello World', 'hello-world'],
    ['seo_title', 'seo-title'],
    ['Café @ Home!!', 'cafe-at-home'],
    ['123 Foo', '123-foo'],
    ['foo--bar', 'foo-bar'],
    ['  Hello ', 'hello'],
    ['', ''],
];

for (const [input, expected] of cases) {
    const actual = slugify(input);
    if (actual !== expected) {
        console.error(`slugify(${JSON.stringify(input)}) => ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
        process.exit(1);
    }
}

if (slugifyInput('hello-') !== 'hello-') {
    console.error('slugifyInput should keep trailing hyphen');
    process.exit(1);
}

if (slugifyInput('hello-w') !== 'hello-w') {
    console.error('slugifyInput mid-segment failed');
    process.exit(1);
}

for (const ok of ['hello-world', 'seo_title', 'field-2', 'a']) {
    if (!FIELD_KEY_PATTERN.test(ok)) {
        console.error(`pattern should accept ${ok}`);
        process.exit(1);
    }
}

for (const bad of ['Hello', '-hello', 'hello-', 'hello--world', '']) {
    if (FIELD_KEY_PATTERN.test(bad)) {
        console.error(`pattern should reject ${bad}`);
        process.exit(1);
    }
}

console.log('slugify.check.mjs: ok');
