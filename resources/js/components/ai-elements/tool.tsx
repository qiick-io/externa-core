import {
    CheckCircleIcon,
    ChevronDownIcon,
    CircleIcon,
    ClockIcon,
    WrenchIcon,
    XCircleIcon,
} from 'lucide-react';
import { isValidElement } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CodeBlock } from '@/components/ai-elements/code-block';
import { Badge } from '@/components/ui/badge';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

/*
 * AI Elements `tool` (registry.ai-sdk.dev), presentation only.
 * Changes from the registry copy: the ai-sdk `ToolUIPart` types are local
 * (Externa streams its own SSE and does not install `ai`); the status icons use
 * the theme status tokens instead of palette colours; the labels go through
 * i18n (`ai.tool.*`).
 */

/** The ai-sdk tool part states the components switch on. */
export type ToolState =
    | 'input-streaming'
    | 'input-available'
    | 'approval-requested'
    | 'approval-responded'
    | 'output-available'
    | 'output-error'
    | 'output-denied';

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, ...props }: ToolProps) => (
    <Collapsible
        className={cn('not-prose mb-4 w-full rounded-md border', className)}
        {...props}
    />
);

export type ToolHeaderProps = {
    title?: string;
    type: `tool-${string}`;
    state: ToolState;
    className?: string;
};

const StatusBadge = ({ status }: { status: ToolState }) => {
    const { t } = useTranslation();

    const icons: Record<ToolState, ReactNode> = {
        'input-streaming': <CircleIcon className="size-4" />,
        'input-available': <ClockIcon className="size-4 animate-pulse" />,
        'approval-requested': <ClockIcon className="size-4 text-warning" />,
        'approval-responded': <CheckCircleIcon className="size-4 text-info" />,
        'output-available': <CheckCircleIcon className="size-4 text-success" />,
        'output-error': <XCircleIcon className="size-4 text-destructive" />,
        'output-denied': <XCircleIcon className="size-4 text-warning" />,
    };

    return (
        <Badge className="gap-1.5 rounded-full text-xs" variant="secondary">
            {icons[status]}
            {t(`ai.tool.state.${status}`)}
        </Badge>
    );
};

export const ToolHeader = ({
    className,
    title,
    type,
    state,
    ...props
}: ToolHeaderProps) => (
    <CollapsibleTrigger
        className={cn(
            'group flex w-full items-center justify-between gap-4 p-3',
            className,
        )}
        {...props}
    >
        <div className="flex items-center gap-2">
            <WrenchIcon className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">
                {title ?? type.split('-').slice(1).join('-')}
            </span>
            <StatusBadge status={state} />
        </div>
        <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
    </CollapsibleTrigger>
);

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
    <CollapsibleContent
        className={cn(
            'text-popover-foreground outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:animate-in data-[state=open]:slide-in-from-top-2',
            className,
        )}
        {...props}
    />
);

export type ToolInputProps = ComponentProps<'div'> & {
    input: unknown;
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => {
    const { t } = useTranslation();

    return (
        <div
            className={cn('space-y-2 overflow-hidden p-4', className)}
            {...props}
        >
            <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {t('ai.tool.parameters')}
            </h4>
            <div className="rounded-md bg-muted/50">
                <CodeBlock
                    code={JSON.stringify(input, null, 2)}
                    language="json"
                />
            </div>
        </div>
    );
};

export type ToolOutputProps = ComponentProps<'div'> & {
    output: unknown;
    errorText?: string;
};

export const ToolOutput = ({
    className,
    output,
    errorText,
    ...props
}: ToolOutputProps) => {
    const { t } = useTranslation();

    if (!(output || errorText)) {
        return null;
    }

    let Output = <div>{output as ReactNode}</div>;

    if (typeof output === 'object' && !isValidElement(output)) {
        Output = (
            <CodeBlock code={JSON.stringify(output, null, 2)} language="json" />
        );
    } else if (typeof output === 'string') {
        Output = <CodeBlock code={output} language="json" />;
    }

    return (
        <div className={cn('space-y-2 p-4', className)} {...props}>
            <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {errorText ? t('ai.tool.error') : t('ai.tool.result')}
            </h4>
            <div
                className={cn(
                    'overflow-x-auto rounded-md text-xs [&_table]:w-full',
                    errorText
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-muted/50 text-foreground',
                )}
            >
                {errorText && <div>{errorText}</div>}
                {Output}
            </div>
        </div>
    );
};
