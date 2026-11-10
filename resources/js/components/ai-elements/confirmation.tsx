import { ShieldAlertIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
    Item,
    ItemActions,
    ItemContent,
    ItemDescription,
    ItemMedia,
    ItemTitle,
} from '@/components/ui/item';

/*
 * AI Elements `confirmation` as shadcn rebuilt it on Item
 * (ui.shadcn.com/docs/ai-elements/base/confirmation): a call waiting for
 * approval, with a question and Deny / Approve. It sits outside the `Trace`;
 * once answered, the call becomes a `Tool` line again. Change from upstream:
 * the button labels go through i18n (`ai.approval.*`). Approve takes the brand
 * (default) variant for a call that writes, and the destructive variant only
 * for one that deletes (`isDestructive`), as for every other destructive action.
 */

export type ConfirmationProps = {
    /** The question, such as "Delete the collection Products?". */
    title: ReactNode;
    description?: ReactNode;
    disabled?: boolean;
    /** The call deletes data: Approve turns destructive. */
    isDestructive?: boolean;
    onApprove: () => void;
    onDeny: () => void;
};

export const Confirmation = ({
    title,
    description,
    disabled = false,
    isDestructive = false,
    onApprove,
    onDeny,
}: ConfirmationProps) => {
    const { t } = useTranslation();

    return (
        <Item variant="outline" size="sm">
            <ItemMedia variant="icon">
                <ShieldAlertIcon />
            </ItemMedia>
            <ItemContent>
                <ItemTitle>{title}</ItemTitle>
                {description ? (
                    <ItemDescription>{description}</ItemDescription>
                ) : null}
            </ItemContent>
            <ItemActions>
                <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={onDeny}
                >
                    {t('ai.approval.reject')}
                </Button>
                <Button
                    size="sm"
                    variant={isDestructive ? 'destructive' : 'default'}
                    disabled={disabled}
                    onClick={onApprove}
                >
                    {t('ai.approval.approve')}
                </Button>
            </ItemActions>
        </Item>
    );
};
