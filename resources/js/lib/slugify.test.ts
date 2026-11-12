import { describe, expect, it } from 'vite-plus/test';
import { FIELD_KEY_PATTERN, slugify } from '@/lib/slugify';

const SAMPLE_INPUTS = [
    '',
    '-',
    '___',
    'Title',
    'My Field!',
    'title-',
    '-title-',
    'legacy_key',
    'a--b__c',
    'Ünïcödé façade',
    'user@example.com',
    '  spaced   out  ',
    '日本語',
    '123',
    'emoji 🎉 key',
];

/** Deterministic pseudo-random strings over ASCII, accents and symbols. */
function randomInputs(count: number): string[] {
    const alphabet = Array.from('aZ9 -_@!./éÜß🎉\t');
    let seed = 744;
    const next = () => {
        seed = (seed * 1103515245 + 12345) % 2 ** 31;

        return seed;
    };

    return Array.from({ length: count }, () =>
        Array.from(
            { length: next() % 12 },
            () => alphabet[next() % alphabet.length],
        ).join(''),
    );
}

describe('slugify', () => {
    // The field key check relies on this: a slug never needs a format error.
    it('always returns an empty string or a valid field key', () => {
        for (const input of [...SAMPLE_INPUTS, ...randomInputs(500)]) {
            const slug = slugify(input);

            expect(slug === '' || FIELD_KEY_PATTERN.test(slug), input).toBe(
                true,
            );
        }
    });
});
