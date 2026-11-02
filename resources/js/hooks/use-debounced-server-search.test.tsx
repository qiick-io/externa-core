import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebouncedServerSearch } from './use-debounced-server-search';

describe('useDebouncedServerSearch', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('does not visit when local search matches the server value', () => {
        const onSearch = vi.fn();

        renderHook(() => useDebouncedServerSearch('ada', 'ada', onSearch, 350));

        act(() => {
            vi.advanceTimersByTime(350);
        });

        expect(onSearch).not.toHaveBeenCalled();
    });

    it('debounces visits when the local value differs', () => {
        const onSearch = vi.fn();

        const { rerender } = renderHook(
            ({ search }) =>
                useDebouncedServerSearch(search, 'ada', onSearch, 350),
            { initialProps: { search: 'ada' } },
        );

        rerender({ search: 'grace' });

        act(() => {
            vi.advanceTimersByTime(349);
        });
        expect(onSearch).not.toHaveBeenCalled();

        act(() => {
            vi.advanceTimersByTime(1);
        });
        expect(onSearch).toHaveBeenCalledTimes(1);
        expect(onSearch).toHaveBeenCalledWith('grace');
    });

    it('cancels a pending visit when the value changes again', () => {
        const onSearch = vi.fn();

        const { rerender } = renderHook(
            ({ search }) =>
                useDebouncedServerSearch(search, '', onSearch, 350),
            { initialProps: { search: 'a' } },
        );

        rerender({ search: 'ab' });

        act(() => {
            vi.advanceTimersByTime(200);
        });

        rerender({ search: 'abc' });

        act(() => {
            vi.advanceTimersByTime(350);
        });

        expect(onSearch).toHaveBeenCalledTimes(1);
        expect(onSearch).toHaveBeenCalledWith('abc');
    });
});
