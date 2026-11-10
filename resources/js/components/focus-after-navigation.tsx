import { useFocusAfterNavigation } from '@/hooks/use-focus-after-navigation';

/**
 * Mount-once helper that restores keyboard focus after Inertia navigations.
 */
export function FocusAfterNavigation(): null {
    useFocusAfterNavigation();

    return null;
}
