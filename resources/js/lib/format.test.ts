import { describe, expect, it } from 'vitest';
import {
    appLocale,
    formatDateTime,
    formatNumber,
    speechRecognitionLang,
} from '@/lib/format';

describe('format helpers', () => {
    it('maps app locales for speech recognition', () => {
        expect(speechRecognitionLang('it')).toBe('it-IT');
        expect(speechRecognitionLang('de')).toBe('de-DE');
        expect(speechRecognitionLang('en')).toBe('en-US');
        expect(speechRecognitionLang('fr')).toBe('en-US');
        expect(appLocale('it-IT')).toBe('it');
    });

    it('formats numbers with an explicit language', () => {
        expect(formatNumber(1234.5, undefined, 'it')).toMatch(/1.?234/);
        expect(formatNumber(1234.5, undefined, 'de')).toMatch(/1.?234/);
    });

    it('formats dates with an explicit language', () => {
        const formatted = formatDateTime(
            '2026-01-15T12:00:00Z',
            {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                timeZone: 'UTC',
            },
            'de',
        );
        expect(formatted.length).toBeGreaterThan(0);
        expect(formatted).toMatch(/2026|15/);
    });
});
