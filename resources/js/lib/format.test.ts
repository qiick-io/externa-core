import { describe, expect, it } from 'vite-plus/test';
import {
    appLocale,
    formatBytes,
    formatDateTime,
    formatFileSize,
    formatNumber,
    formatUserDisplayName,
    initialsFromName,
    speechRecognitionLang,
    toDatetimeLocalValue,
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

describe('formatBytes', () => {
    it('formats binary units', () => {
        expect(formatBytes(0)).toBe('0 B');
        expect(formatBytes(1024)).toBe('1.0 KB');
        expect(formatBytes(1536)).toBe('1.5 KB');
    });

    it('uses the empty placeholder for nullish values', () => {
        expect(formatBytes(null)).toBe('—');
        expect(formatBytes(undefined, 'n/a')).toBe('n/a');
    });
});

describe('formatFileSize', () => {
    it('treats zero and null as empty', () => {
        expect(formatFileSize(null)).toBe('—');
        expect(formatFileSize(0)).toBe('—');
        expect(formatFileSize(2048)).toBe('2.0 KB');
    });
});

describe('initialsFromName', () => {
    it('builds up to two initials', () => {
        expect(initialsFromName('Ada Lovelace')).toBe('AL');
        expect(initialsFromName('Ada')).toBe('AD');
        expect(initialsFromName('  ')).toBe('?');
    });

    it('takes the first and the last word', () => {
        expect(initialsFromName('Maria Grazia Rossi')).toBe('MR');
    });
});

describe('formatUserDisplayName', () => {
    it('joins trimmed name parts', () => {
        expect(formatUserDisplayName('Ada', 'Lovelace')).toBe('Ada Lovelace');
        expect(formatUserDisplayName('Ada', null)).toBe('Ada');
        expect(formatUserDisplayName('', null)).toBe('');
    });
});

describe('toDatetimeLocalValue', () => {
    it('slices ISO strings without seconds by default', () => {
        expect(toDatetimeLocalValue('2024-01-02T03:04:05Z')).toBe(
            '2024-01-02T03:04',
        );
        expect(toDatetimeLocalValue('2024-01-02T03:04:05Z', true)).toBe(
            '2024-01-02T03:04:05',
        );
    });

    it('expands date-only values', () => {
        expect(toDatetimeLocalValue('2024-01-02')).toBe('2024-01-02T00:00');
    });

    it('returns empty for nullish input', () => {
        expect(toDatetimeLocalValue(null)).toBe('');
        expect(toDatetimeLocalValue(undefined)).toBe('');
    });
});
