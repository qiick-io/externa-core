import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * Inline validation message for form fields; renders nothing when empty.
 * @param {HTMLAttributes<HTMLParagraphElement> & { message?: string }} props - Paragraph props plus message.
 * @param {string} [props.message] - Error text to display.
 * @returns {JSX.Element | null}
 */
export default function InputError({
    message,
    className = '',
    ...props
}: HTMLAttributes<HTMLParagraphElement> & { message?: string }) {
    return message ? (
        <p
            {...props}
            role="alert"
            className={cn('text-sm text-red-600 dark:text-red-400', className)}
        >
            {message}
        </p>
    ) : null;
}
