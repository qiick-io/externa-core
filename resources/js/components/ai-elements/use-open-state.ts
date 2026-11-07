import { useCallback, useState } from 'react';

/**
 * Open state that a parent may control (`open` + `onOpenChange`) or leave to
 * the component (`defaultOpen`). Stands in for Radix's internal
 * `useControllableState`, which the AI Elements sources import directly.
 */
export function useOpenState(
    open: boolean | undefined,
    defaultOpen: boolean,
    onOpenChange?: (open: boolean) => void,
): [boolean, (open: boolean) => void] {
    const [uncontrolled, setUncontrolled] = useState(defaultOpen);
    const isControlled = open !== undefined;

    const setOpen = useCallback(
        (next: boolean) => {
            if (!isControlled) {
                setUncontrolled(next);
            }

            onOpenChange?.(next);
        },
        [isControlled, onOpenChange],
    );

    return [isControlled ? open : uncontrolled, setOpen];
}
