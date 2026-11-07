import { ArrowUp, Square } from 'lucide-react';
import type {
    ClipboardEvent,
    FormEvent,
    KeyboardEvent,
    MouseEvent,
    ReactNode,
    Ref,
} from 'react';
import { Button } from '@/components/ui/button';
import {
    InputGroup,
    InputGroupAddon,
    InputGroupTextarea,
} from '@/components/ui/input-group';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

type ChatComposerProps = {
    value: string;
    /** New text and caret position (for @mention detection). */
    onValueChange: (value: string, caret: number) => void;
    onSubmit: () => void;
    /** Whether Enter and the send button may send now; the caller owns the rules. */
    canSubmit: boolean;
    placeholder: string;
    /** Accessible name of the textarea. */
    label: string;
    sendLabel: string;
    /** Shows Stop instead of send, and locks the textarea. */
    isStreaming?: boolean;
    onStop?: () => void;
    stopLabel?: string;
    /** Spinner in the send button while a send is in flight. */
    isSubmitting?: boolean;
    disabled?: boolean;
    textareaRef?: Ref<HTMLTextAreaElement>;
    /**
     * Runs before the composer's own Enter handling (never during IME
     * composition). Call `event.preventDefault()` to take the key, e.g. to
     * pick a mention.
     */
    onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
    onPaste?: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
    /** Above the textarea, inside the frame: attachment chips, reply preview. */
    header?: ReactNode;
    /** Left side of the action row. */
    actions?: ReactNode;
    /** Right side of the action row, before send / Stop (voice). */
    trailingActions?: ReactNode;
    /** Positioned above the frame (the mention list). */
    popup?: ReactNode;
    textareaTestId?: string;
    submitTestId?: string;
    className?: string;
};

/**
 * The message composer of the Assistant page, the Assistant panel, the human
 * chat and the attachments dialog: shadcn `input-group` with an auto-growing
 * `InputGroupTextarea` (`field-sizing-content`) and a block-end action row.
 *
 * Enter sends and Shift+Enter adds a line; Enter during IME composition never
 * sends. While `isStreaming`, the send button becomes Stop, which never submits.
 */
export function ChatComposer({
    value,
    onValueChange,
    onSubmit,
    canSubmit,
    placeholder,
    label,
    sendLabel,
    isStreaming = false,
    onStop,
    stopLabel,
    isSubmitting = false,
    disabled = false,
    textareaRef,
    onKeyDown,
    onPaste,
    header,
    actions,
    trailingActions,
    popup,
    textareaTestId,
    submitTestId,
    className,
}: ChatComposerProps) {
    const isSendable = canSubmit && !disabled && !isStreaming;

    const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
        event.preventDefault();

        if (isSendable) {
            onSubmit();
        }
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
        if (event.nativeEvent.isComposing) {
            return;
        }

        onKeyDown?.(event);

        if (event.defaultPrevented || event.key !== 'Enter' || event.shiftKey) {
            return;
        }

        event.preventDefault();

        if (isSendable) {
            onSubmit();
        }
    };

    const handleStopClick = (event: MouseEvent<HTMLButtonElement>): void => {
        // Stop sits where send was: it must never fall through to a submit.
        event.preventDefault();
        event.stopPropagation();
        onStop?.();
    };

    return (
        <form
            className={cn('relative w-full', className)}
            onSubmit={handleSubmit}
        >
            {popup}
            <InputGroup
                data-disabled={disabled ? 'true' : undefined}
                className="rounded-2xl"
            >
                {header ? (
                    <InputGroupAddon
                        align="block-start"
                        className="cursor-auto"
                    >
                        {header}
                    </InputGroupAddon>
                ) : null}
                <InputGroupTextarea
                    ref={textareaRef}
                    value={value}
                    rows={1}
                    placeholder={placeholder}
                    aria-label={label}
                    disabled={disabled || isStreaming}
                    data-test={textareaTestId}
                    className="max-h-42 min-h-10 pt-3 pb-2"
                    onChange={(event) =>
                        onValueChange(
                            event.target.value,
                            event.target.selectionStart,
                        )
                    }
                    onKeyDown={handleKeyDown}
                    onPaste={onPaste}
                />
                <InputGroupAddon
                    align="block-end"
                    className="cursor-auto justify-between gap-2 px-2 pb-2"
                >
                    <div className="flex items-center gap-1">{actions}</div>
                    <div className="flex items-center gap-1">
                        {trailingActions}
                        {isStreaming && onStop ? (
                            <Button
                                type="button"
                                size="icon"
                                variant="destructive"
                                className="rounded-full"
                                onClick={handleStopClick}
                                aria-label={stopLabel}
                            >
                                <Square className="size-3.5 fill-current" />
                            </Button>
                        ) : (
                            <Button
                                type="submit"
                                size="icon"
                                className="rounded-full"
                                disabled={!isSendable || isSubmitting}
                                aria-label={sendLabel}
                                data-test={submitTestId}
                            >
                                {isSubmitting ? (
                                    <Spinner className="size-4" />
                                ) : (
                                    <ArrowUp className="size-4" />
                                )}
                            </Button>
                        )}
                    </div>
                </InputGroupAddon>
            </InputGroup>
        </form>
    );
}
