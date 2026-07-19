import { AlertCircleIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

/**
 * Destructive alert listing deduplicated error messages.
 * @param {{ errors: string[], title?: string }} props - Component props.
 * @param {string[]} props.errors - Error strings to list.
 * @param {string} [props.title] - Alert title (defaults to a generic message).
 * @returns {JSX.Element}
 */
export default function AlertError({
    errors,
    title,
}: {
    errors: string[];
    title?: string;
}) {
    return (
        <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>{title || 'Something went wrong.'}</AlertTitle>
            <AlertDescription>
                <ul className="list-inside list-disc text-sm">
                    {Array.from(new Set(errors)).map((error, index) => (
                        <li key={index}>{error}</li>
                    ))}
                </ul>
            </AlertDescription>
        </Alert>
    );
}
