import { MoreHorizontal } from 'lucide-react';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { FileActionDefinition, FileActionKey } from '@/types/files';

type FilesActionsOverflowProps = {
    actions: FileActionDefinition[];
    onAction: (key: FileActionKey) => void;
    className?: string;
};

const MIN_VALID_ACTION_WIDTH = 24;

/**
 * Responsive overflow menu for file bulk actions.
 * @param {*} props - Component props.
 * @returns {JSX.Element}
 */
export function FilesActionsOverflow({
    actions,
    onAction,
    className,
}: FilesActionsOverflowProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const overflowButtonRef = useRef<HTMLButtonElement>(null);
    const actionButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
    const [overflowStart, setOverflowStart] = useState(actions.length);

    const setActionButtonRef = useCallback(
        (key: string) => (element: HTMLButtonElement | null) => {
            if (element) {
                actionButtonRefs.current.set(key, element);
            } else {
                actionButtonRefs.current.delete(key);
            }
        },
        [],
    );

    const measureItems = useCallback(() => {
        const container = containerRef.current;
        const overflowButton = overflowButtonRef.current;
        const totalActions = actions.length;

        if (
            !container ||
            totalActions === 0 ||
            actionButtonRefs.current.size < totalActions
        ) {
            setOverflowStart(totalActions);

            return;
        }

        const availableWidth = Math.max(0, container.clientWidth - 20);
        let overflowButtonWidth = 40;

        if (overflowButton) {
            const style = window.getComputedStyle(overflowButton);
            overflowButtonWidth =
                overflowButton.offsetWidth +
                (Number.parseFloat(style.marginRight || '0') || 0);
        }

        let usedWidth = 0;
        let cutIndex = totalActions;

        for (let index = 0; index < totalActions; index += 1) {
            const action = actions[index];
            const button = actionButtonRefs.current.get(action.key);

            if (!button) {
                cutIndex = index;
                break;
            }

            let buttonWidth = 0;
            const cached = button.dataset.calculatedWidth;

            if (cached && /^\d+(\.\d+)?$/.test(cached)) {
                buttonWidth = Number.parseFloat(cached);

                if (
                    Number.isNaN(buttonWidth) ||
                    buttonWidth < MIN_VALID_ACTION_WIDTH
                ) {
                    buttonWidth = 0;
                }
            }

            if (buttonWidth === 0) {
                const wrapper = button.parentElement;
                const measureTarget = wrapper ?? button;
                const wasHidden = measureTarget.classList.contains('hidden');

                if (wasHidden) {
                    measureTarget.style.display = 'flex';
                }

                const style = window.getComputedStyle(measureTarget);
                buttonWidth =
                    measureTarget.getBoundingClientRect().width +
                    (Number.parseFloat(style.marginRight || '0') || 0);

                if (buttonWidth > 0) {
                    button.dataset.calculatedWidth = String(buttonWidth);
                }

                if (wasHidden) {
                    measureTarget.style.display = '';
                }
            }

            const needsOverflow = index < totalActions - 1;
            const nextTotal =
                usedWidth +
                buttonWidth +
                (needsOverflow ? overflowButtonWidth : 0);

            if (nextTotal >= availableWidth) {
                cutIndex = index;
                break;
            }

            usedWidth += buttonWidth;
        }

        setOverflowStart(cutIndex);
    }, [actions]);

    useLayoutEffect(() => {
        const container = containerRef.current;

        if (!container) {
            return;
        }

        const observer = new ResizeObserver(() => measureItems());
        observer.observe(container);
        measureItems();

        return () => observer.disconnect();
    }, [measureItems, actions]);

    const overflowActions = useMemo(
        () => actions.slice(overflowStart),
        [actions, overflowStart],
    );

    return (
        <div
            ref={containerRef}
            className={cn(
                'flex min-w-0 flex-1 items-center gap-1 overflow-hidden',
                className,
            )}
        >
            {actions.map((action, index) => {
                const Icon = action.icon;

                return (
                    <div
                        key={action.key}
                        className={cn(index >= overflowStart && 'hidden')}
                    >
                        <Button
                            ref={setActionButtonRef(action.key)}
                            type="button"
                            size="sm"
                            variant={
                                action.destructive ? 'destructive' : 'outline'
                            }
                            onClick={() => onAction(action.key)}
                        >
                            <Icon className="size-4" />
                            {action.label}
                        </Button>
                    </div>
                );
            })}

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        ref={overflowButtonRef}
                        type="button"
                        size="sm"
                        variant="outline"
                        className={cn(overflowActions.length === 0 && 'hidden')}
                        aria-label="More actions"
                    >
                        <MoreHorizontal className="size-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    {overflowActions.map((action) => {
                        const Icon = action.icon;

                        return (
                            <DropdownMenuItem
                                key={action.key}
                                variant={
                                    action.destructive
                                        ? 'destructive'
                                        : 'default'
                                }
                                onSelect={() => onAction(action.key)}
                            >
                                <Icon className="size-4" />
                                {action.label}
                            </DropdownMenuItem>
                        );
                    })}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
