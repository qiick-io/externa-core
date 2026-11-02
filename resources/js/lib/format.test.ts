import { describe, expect, it } from 'vitest';
import {
    formatBytes,
    formatFileSize,
    initialsFromName,
    toDatetimeLocalValue,
} from './format';

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
