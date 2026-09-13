import { RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';

type UnsavedChangesToolbarProps = {
    /** Local dirty flag for this form (preferred over registry poll). */
    isDirty: boolean;
    className?: string;
};

/**
 * Unsaved badge + Discard that stays on the page (confirm via leave dialog).
 */
export function UnsavedChangesToolbar({
    isDirty,
    className,
}: UnsavedChangesToolbarProps) {
    const { t } = useTranslation();
    const { requestDiscard } = useUnsavedChanges();

    if (!isDirty) {
        return null;
    }

    return (
        <div className={className} data-test="unsaved-changes-toolbar">
            <Badge
                variant="outline"
                className="border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200"
                data-test="unsaved-badge"
            >
                {t('unsavedChanges.badge')}
            </Badge>
            <Button
                type="button"
                variant="outline"
                data-test="discard-changes"
                onClick={() => {
                    void requestDiscard();
                }}
            >
                <RotateCcw className="size-4" />
                {t('unsavedChanges.discardToolbar')}
            </Button>
        </div>
    );
}
