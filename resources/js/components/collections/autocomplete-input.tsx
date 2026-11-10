import { useRef, useState } from 'react';
import type {
    ComponentProps,
    KeyboardEvent,
    ReactElement,
    RefObject,
} from 'react';
import {
    Command,
    CommandGroup,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import {
    Popover,
    PopoverAnchor,
    PopoverContent,
} from '@/components/ui/popover';

/**
 * cmdk highlights the first item whenever its value is empty; a value no
 * item has keeps the list unhighlighted until the user moves into it.
 */
const NO_HIGHLIGHT_VALUE = '__autocomplete-no-highlight__';

type AutocompleteSuggestion = { value: string; label: string };

type AutocompleteInputProps = Omit<ComponentProps<typeof Input>, 'list'> & {
    suggestions: AutocompleteSuggestion[];
    onSelectSuggestion: (suggestion: AutocompleteSuggestion) => void;
    /** Controlled open state; omit to let the input open on typing, click and ArrowDown. */
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** Wraps the input, e.g. `InputWithIcons`. The anchor stays the wrapper. */
    renderInput?: (input: ReactElement) => ReactElement;
    /**
     * Element the list is anchored to (and as wide as) instead of the input,
     * e.g. a chip box whose input shrinks as chips are added: a resizing
     * anchor makes the popper re-measure inside a ResizeObserver callback.
     */
    anchorRef?: RefObject<HTMLElement | null>;
};

/**
 * Free-text input with a suggestion list: the shadcn Popover + Command
 * pattern anchored to a real `Input`, so the typed text is what the form
 * submits (`name` stays on the input). Arrow keys move through the
 * suggestions and Enter picks the highlighted one; Enter without a
 * highlighted suggestion keeps its native meaning (submit, or the caller's
 * own `onKeyDown`). Replaces `<datalist>` and hand-made listboxes.
 * @returns {JSX.Element}
 */
export function AutocompleteInput({
    suggestions,
    onSelectSuggestion,
    open: controlledOpen,
    onOpenChange,
    renderInput = (input) => input,
    anchorRef: externalAnchorRef,
    onKeyDown,
    onChange,
    onClick,
    readOnly,
    disabled,
    ...inputProps
}: AutocompleteInputProps) {
    const anchorRef = useRef<HTMLDivElement>(null);
    const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
    const [highlightedValue, setHighlightedValue] = useState('');
    /** The suggestion list the user last moved through with keys or pointer. */
    const [navigatedListKey, setNavigatedListKey] = useState<string | null>(
        null,
    );
    const open = controlledOpen ?? uncontrolledOpen;
    const isOpen =
        open && suggestions.length > 0 && !readOnly && disabled !== true;

    const setOpen = (next: boolean): void => {
        setUncontrolledOpen(next);
        onOpenChange?.(next);
    };

    const listKey = isOpen
        ? suggestions.map((suggestion) => suggestion.value).join('\n')
        : null;
    const hasNavigated = listKey !== null && navigatedListKey === listKey;
    const markNavigated = (): void => setNavigatedListKey(listKey);

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            if (!isOpen) {
                event.preventDefault();
                event.stopPropagation();
                setOpen(true);

                return;
            }

            markNavigated();

            return;
        }

        if (event.key === 'Enter' && isOpen && hasNavigated) {
            // cmdk (on the Command root) selects the highlighted suggestion.
            return;
        }

        onKeyDown?.(event);

        if (
            event.key === 'Enter' ||
            event.key === 'Home' ||
            event.key === 'End'
        ) {
            // Keep the native behaviour (form submit, caret moves) away from cmdk.
            event.stopPropagation();
        }
    };

    const input = (
        <Input
            {...inputProps}
            readOnly={readOnly}
            disabled={disabled}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={isOpen}
            autoComplete="off"
            onChange={(event) => {
                onChange?.(event);
                setOpen(true);
            }}
            onClick={(event) => {
                onClick?.(event);
                setOpen(true);
            }}
            onKeyDown={handleKeyDown}
        />
    );

    return (
        <Command
            shouldFilter={false}
            value={hasNavigated ? highlightedValue : NO_HIGHLIGHT_VALUE}
            onValueChange={setHighlightedValue}
            className="h-auto overflow-visible rounded-none bg-transparent text-inherit"
        >
            <Popover open={isOpen} onOpenChange={setOpen}>
                {externalAnchorRef ? (
                    <>
                        <PopoverAnchor virtualRef={externalAnchorRef} />
                        <div ref={anchorRef}>{renderInput(input)}</div>
                    </>
                ) : (
                    <PopoverAnchor asChild>
                        <div ref={anchorRef}>{renderInput(input)}</div>
                    </PopoverAnchor>
                )}
                <PopoverContent
                    className="w-(--radix-popover-trigger-width) p-0"
                    onOpenAutoFocus={(event) => event.preventDefault()}
                    onInteractOutside={(event) => {
                        const target = event.target as Node;

                        if (
                            anchorRef.current?.contains(target) ||
                            externalAnchorRef?.current?.contains(target)
                        ) {
                            event.preventDefault();
                        }
                    }}
                >
                    <CommandList onPointerMove={() => markNavigated()}>
                        <CommandGroup>
                            {suggestions.map((suggestion) => (
                                <CommandItem
                                    key={suggestion.value}
                                    value={suggestion.value}
                                    onMouseDown={(event) =>
                                        event.preventDefault()
                                    }
                                    onSelect={() => {
                                        onSelectSuggestion(suggestion);
                                        setOpen(false);
                                    }}
                                >
                                    {suggestion.label}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </PopoverContent>
            </Popover>
        </Command>
    );
}
