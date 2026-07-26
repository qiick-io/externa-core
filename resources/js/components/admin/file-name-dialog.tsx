import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type FileNameDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: string;
    initialName?: string;
    confirmLabel?: string;
    onConfirm: (name: string) => Promise<void>;
};

/**
 * Dialog to confirm or edit a file or folder name.
 * @param {*} props - Component props.
 * @returns {JSX.Element}
 */
export function FileNameDialog({
    open,
    onOpenChange,
    title,
    description,
    initialName = '',
    confirmLabel = 'Save',
    onConfirm,
}: FileNameDialogProps) {
    const [name, setName] = useState(initialName);
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (open) {
            setName(initialName);
            setError(null);
        }
    }, [initialName, open]);

    const submit = async (): Promise<void> => {
        const trimmedName = name.trim();

        if (trimmedName === '') {
            setError('Name is required.');

            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            await onConfirm(trimmedName);
            onOpenChange(false);
        } catch (submitError) {
            setError(
                submitError instanceof Error
                    ? submitError.message
                    : 'Something went wrong.',
            );
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    {description ? (
                        <DialogDescription>{description}</DialogDescription>
                    ) : null}
                </DialogHeader>

                <div className="grid gap-2">
                    <Label htmlFor="file-name-input">Name</Label>
                    <Input
                        id="file-name-input"
                        value={name}
                        autoFocus
                        disabled={submitting}
                        onChange={(event) => setName(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                void submit();
                            }
                        }}
                    />
                    {error ? (
                        <p className="text-sm text-destructive">{error}</p>
                    ) : null}
                </div>

                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        disabled={submitting}
                        onClick={() => onOpenChange(false)}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        disabled={submitting || name.trim() === ''}
                        onClick={() => void submit()}
                    >
                        {submitting ? 'Saving…' : confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
