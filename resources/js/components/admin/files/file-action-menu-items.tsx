import { Fragment } from 'react';
import type { ComponentType, ReactNode } from 'react';
import type { FileActionDefinition, FileActionKey } from '@/types/files';

type MenuItemComponent = ComponentType<{
    variant?: 'default' | 'destructive';
    disabled?: boolean;
    title?: string;
    onSelect?: (event: Event) => void;
    children?: ReactNode;
    'data-testid'?: string;
}>;

/**
 * One rendering of the file actions for both the card's right-click
 * ContextMenu and its ⋮ DropdownMenu, so the two menus always list the same
 * items in the same order. The caller passes its menu's Item and Separator.
 *
 * @returns {JSX.Element}
 */
export function FileActionMenuItems({
    actions,
    onAction,
    item: Item,
    separator: Separator,
}: {
    actions: FileActionDefinition[];
    onAction: (key: FileActionKey) => void;
    item: MenuItemComponent;
    separator: ComponentType;
}) {
    const firstDestructiveIndex = actions.findIndex(
        (action) => action.destructive,
    );

    return actions.map((action, index) => {
        const Icon = action.icon;
        const showSeparator =
            firstDestructiveIndex > 0 && index === firstDestructiveIndex;

        return (
            <Fragment key={action.key}>
                {showSeparator && <Separator />}
                <Item
                    variant={action.destructive ? 'destructive' : 'default'}
                    data-testid={`files-context-action-${action.key}`}
                    disabled={Boolean(action.disabledReason)}
                    onSelect={() => onAction(action.key)}
                >
                    <Icon className="size-4" />
                    {action.disabledReason ? (
                        <span className="flex flex-col">
                            {action.label}
                            <span className="text-xs text-muted-foreground">
                                {action.disabledReason}
                            </span>
                        </span>
                    ) : (
                        action.label
                    )}
                </Item>
            </Fragment>
        );
    });
}
