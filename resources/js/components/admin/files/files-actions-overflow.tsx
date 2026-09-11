import { ActionsOverflow } from '@/components/admin/actions-overflow';
import type { OverflowActionDefinition } from '@/components/admin/actions-overflow';
import type { FileActionDefinition, FileActionKey } from '@/types/files';

type FilesActionsOverflowProps = {
    actions: FileActionDefinition[];
    onAction: (key: FileActionKey) => void;
    className?: string;
};

/**
 * File-manager wrapper around shared {@link ActionsOverflow}.
 */
export function FilesActionsOverflow({
    actions,
    onAction,
    className,
}: FilesActionsOverflowProps) {
    return (
        <ActionsOverflow
            actions={actions as OverflowActionDefinition[]}
            onAction={(key) => onAction(key as FileActionKey)}
            className={className}
            iconOnly
        />
    );
}
