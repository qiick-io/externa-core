import { BookIcon, ChevronDownIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

/*
 * AI Elements `sources` (registry.ai-sdk.dev). Change from the registry copy:
 * the trigger label goes through i18n (`ai.sources.used`).
 */

export type SourcesProps = ComponentProps<typeof Collapsible>;

export const Sources = ({ className, ...props }: SourcesProps) => (
    <Collapsible
        className={cn('not-prose text-xs text-primary', className)}
        {...props}
    />
);

export type SourcesTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
    count: number;
};

export const SourcesTrigger = ({
    className,
    count,
    children,
    ...props
}: SourcesTriggerProps) => {
    const { t } = useTranslation();

    return (
        <CollapsibleTrigger
            className={cn('group flex items-center gap-2', className)}
            {...props}
        >
            {children ?? (
                <>
                    <p className="font-medium">
                        {t('ai.sources.used', { count })}
                    </p>
                    <ChevronDownIcon className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
                </>
            )}
        </CollapsibleTrigger>
    );
};

export type SourcesContentProps = ComponentProps<typeof CollapsibleContent>;

export const SourcesContent = ({
    className,
    ...props
}: SourcesContentProps) => (
    <CollapsibleContent
        className={cn(
            'mt-3 flex w-fit flex-col gap-2',
            'outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:animate-in data-[state=open]:slide-in-from-top-2',
            className,
        )}
        {...props}
    />
);

export type SourceProps = ComponentProps<'a'>;

export const Source = ({ href, title, children, ...props }: SourceProps) => (
    <a
        className="flex items-center gap-2"
        href={href}
        rel="noreferrer"
        target="_blank"
        {...props}
    >
        {children ?? (
            <>
                <BookIcon className="h-4 w-4" />
                <span className="block font-medium">{title}</span>
            </>
        )}
    </a>
);
