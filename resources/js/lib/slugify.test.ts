import assert from 'node:assert/strict';
import test from 'node:test';
import { slugify, slugifyInput } from './slugify.ts';

test('slugify matches Laravel Str::slug defaults for common cases', () => {
    assert.equal(slugify('Hello World'), 'hello-world');
    assert.equal(slugify('  Café @ Home!! '), 'cafe-at-home');
    assert.equal(slugify('---'), '');
    assert.equal(slugify(''), '');
});

test('slugifyInput keeps trailing separator while typing', () => {
    assert.equal(slugifyInput('hello '), 'hello-');
    assert.equal(slugifyInput('hello-'), 'hello-');
    assert.equal(slugifyInput('hello'), 'hello');
    assert.equal(slugifyInput('---'), '');
});
