import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
    formatUserDisplayName,
    getInitialsFromParts,
    useInitials,
} from './use-initials.tsx';

describe('getInitialsFromParts', () => {
    it('builds two-letter initials from first and last name', () => {
        expect(getInitialsFromParts('Ada', 'Lovelace')).toBe('AL');
    });

    it('falls back to a single initial when only one part is present', () => {
        expect(getInitialsFromParts('Ada', null)).toBe('A');
        expect(getInitialsFromParts('', 'Lovelace')).toBe('L');
    });

    it('returns empty string when both parts are blank', () => {
        expect(getInitialsFromParts('  ', '  ')).toBe('');
    });
});

describe('formatUserDisplayName', () => {
    it('joins trimmed name parts', () => {
        expect(formatUserDisplayName('Ada', 'Lovelace')).toBe('Ada Lovelace');
        expect(formatUserDisplayName('Ada', null)).toBe('Ada');
    });
});

describe('useInitials', () => {
    it('exposes a stable callback that matches getInitialsFromParts', () => {
        const { result, rerender } = renderHook(() => useInitials());
        const first = result.current;

        expect(first('Grace', 'Hopper')).toBe('GH');
        rerender();
        expect(result.current).toBe(first);
    });
});
