import { ChevronDownIcon } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

function NativeSelect({
    className,
    size = 'default',
    ...props
}: Omit<React.ComponentProps<'select'>, 'size'> & {
    size?: 'sm' | 'default';
}) {
    const isFullWidth = Boolean(
        className?.split(/\s+/).some((token) => token === 'w-full'),
    );

    return (
        <div
            className={cn(
                'group/native-select relative has-[select:disabled]:opacity-50',
                isFullWidth ? 'w-full' : 'w-fit',
            )}
            data-slot="native-select-wrapper"
        >
            <select
                data-slot="native-select"
                data-size={size}
                className={cn(
                    'border-input placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 dark:hover:bg-input/50 h-control w-full min-w-0 appearance-none rounded-md border bg-transparent px-3 py-2 pr-9 text-sm shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed data-[size=sm]:h-control-sm data-[size=sm]:py-1',
                    'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
                    className,
                )}
                {...props}
            />
            <ChevronDownIcon
                className="text-muted-foreground pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 opacity-50 select-none"
                aria-hidden="true"
                data-slot="native-select-icon"
            />
        </div>
    );
}

function NativeSelectOption({
    className,
    ...props
}: React.ComponentProps<'option'>) {
    return (
        <option
            data-slot="native-select-option"
            className={cn('bg-[Canvas] text-[CanvasText]', className)}
            {...props}
        />
    );
}

function NativeSelectOptGroup({
    className,
    ...props
}: React.ComponentProps<'optgroup'>) {
    return (
        <optgroup
            data-slot="native-select-optgroup"
            className={cn('bg-[Canvas] text-[CanvasText]', className)}
            {...props}
        />
    );
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption };
