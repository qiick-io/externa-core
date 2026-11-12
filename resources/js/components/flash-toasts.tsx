import { usePage } from '@inertiajs/react';
import { useEffect, useRef } from 'react';
import { toast } from '@/lib/toast';

type FlashBag = {
    success?: string | null;
    error?: string | null;
    warning?: string | null;
};

/**
 * Surfaces session flash success/error/warning as toasts after Inertia redirects.
 */
export function FlashToasts() {
    const flash = (usePage().props as { flash?: FlashBag }).flash;
    const last = useRef<string>('');

    useEffect(() => {
        const success =
            typeof flash?.success === 'string' ? flash.success : null;
        const error = typeof flash?.error === 'string' ? flash.error : null;
        const warning =
            typeof flash?.warning === 'string' ? flash.warning : null;
        const key = `${success ?? ''}|${error ?? ''}|${warning ?? ''}`;

        if (!success && !error && !warning) {
            return;
        }

        if (key === last.current) {
            return;
        }

        last.current = key;

        if (success) {
            toast.success(success);
        }

        if (error) {
            toast.error(error);
        }

        if (warning) {
            toast.warning(warning);
        }
    }, [flash?.success, flash?.error, flash?.warning]);

    return null;
}
