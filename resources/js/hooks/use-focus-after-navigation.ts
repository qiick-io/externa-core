import { router } from '@inertiajs/react';
import { useEffect } from 'react';
import { focusPageMain } from '@/lib/focus-page-main';

/**
 * After Inertia navigations, move focus to `#main-content` when it would
 * otherwise remain on `<body>` (destructive actions, full-page visits).
 */
export function useFocusAfterNavigation(): void {
    useEffect(() => {
        const removeNavigate = router.on('navigate', () => {
            window.requestAnimationFrame(() => {
                focusPageMain();
            });
        });

        return () => {
            removeNavigate();
        };
    }, []);
}
