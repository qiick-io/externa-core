import { act, renderHook } from '@testing-library/react';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vite-plus/test';
import { useDebouncedFieldKeyError } from '@/components/collections/field-settings/use-debounced-field-key-error';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

const SIBLING_FIELD_NAMES = ['title', 'legacy_key'];
const DUPLICATE_KEY_ERROR = 'collections.fieldSettings.form.keyDuplicate';

function renderKeyError(fieldKey: string) {
    return renderHook(
        ({ key }) => useDebouncedFieldKeyError(key, SIBLING_FIELD_NAMES),
        { initialProps: { key: fieldKey } },
    );
}

describe('useDebouncedFieldKeyError', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('reports a duplicate key only after the debounce', () => {
        const { result } = renderKeyError('title');

        expect(result.current).toBeUndefined();

        act(() => {
            vi.advanceTimersByTime(349);
        });

        expect(result.current).toBeUndefined();

        act(() => {
            vi.advanceTimersByTime(1);
        });

        expect(result.current).toBe(DUPLICATE_KEY_ERROR);
    });

    it('compares the finalized slug of a key typed with a trailing hyphen', () => {
        const { result } = renderKeyError('title-');

        act(() => {
            vi.advanceTimersByTime(350);
        });

        expect(result.current).toBe(DUPLICATE_KEY_ERROR);
    });

    it('keeps legacy underscore keys as they are', () => {
        const { result } = renderKeyError('legacy_key');

        act(() => {
            vi.advanceTimersByTime(350);
        });

        expect(result.current).toBe(DUPLICATE_KEY_ERROR);
    });

    it('compares the slug of a key typed with invalid characters', () => {
        const { result, rerender } = renderKeyError('Title!');

        act(() => {
            vi.advanceTimersByTime(350);
        });

        expect(result.current).toBe(DUPLICATE_KEY_ERROR);

        rerender({ key: 'My Field?' });

        act(() => {
            vi.advanceTimersByTime(350);
        });

        expect(result.current).toBeUndefined();
    });

    it('clears the error for an empty or unique key', () => {
        const { result, rerender } = renderKeyError('title');

        act(() => {
            vi.advanceTimersByTime(350);
        });

        expect(result.current).toBeDefined();

        rerender({ key: 'subtitle' });

        act(() => {
            vi.advanceTimersByTime(350);
        });

        expect(result.current).toBeUndefined();

        rerender({ key: '' });

        act(() => {
            vi.advanceTimersByTime(350);
        });

        expect(result.current).toBeUndefined();
    });

    it('restarts the debounce on every change', () => {
        const { result, rerender } = renderKeyError('subtitle');

        act(() => {
            vi.advanceTimersByTime(200);
        });

        rerender({ key: 'title' });

        act(() => {
            vi.advanceTimersByTime(200);
        });

        expect(result.current).toBeUndefined();

        act(() => {
            vi.advanceTimersByTime(150);
        });

        expect(result.current).toBe(DUPLICATE_KEY_ERROR);
    });

    it('does not restart the debounce when the parent re-renders with a new sibling array', () => {
        const { result, rerender } = renderHook(
            ({ names }) => useDebouncedFieldKeyError('title', names),
            { initialProps: { names: [...SIBLING_FIELD_NAMES] } },
        );

        act(() => {
            vi.advanceTimersByTime(200);
        });

        // Same names in a new array, as an inline `siblingFieldNames.filter(...)` passes.
        rerender({ names: [...SIBLING_FIELD_NAMES] });

        act(() => {
            vi.advanceTimersByTime(150);
        });

        expect(result.current).toBe(DUPLICATE_KEY_ERROR);

        rerender({ names: [...SIBLING_FIELD_NAMES] });

        expect(result.current).toBe(DUPLICATE_KEY_ERROR);
    });
});
