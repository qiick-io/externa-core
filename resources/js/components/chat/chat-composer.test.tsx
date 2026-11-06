import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatComposer } from '@/components/chat/chat-composer';

function renderComposer(
    props: Partial<ComponentProps<typeof ChatComposer>> = {},
) {
    const onSubmit = vi.fn();
    const onValueChange = vi.fn();
    const onStop = vi.fn();

    render(
        <ChatComposer
            value="Hello"
            onValueChange={onValueChange}
            onSubmit={onSubmit}
            onStop={onStop}
            canSubmit
            placeholder="Write a message…"
            label="Message"
            sendLabel="Send"
            stopLabel="Stop"
            {...props}
        />,
    );

    return {
        onSubmit,
        onValueChange,
        onStop,
        textarea: screen.getByRole('textbox', { name: 'Message' }),
    };
}

describe('ChatComposer', () => {
    afterEach(() => {
        cleanup();
    });

    it('sends on Enter and on the send button', () => {
        const { onSubmit, textarea } = renderComposer();

        fireEvent.keyDown(textarea, { key: 'Enter' });
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));

        expect(onSubmit).toHaveBeenCalledTimes(2);
    });

    it('keeps Shift+Enter for a new line', () => {
        const { onSubmit, textarea } = renderComposer();

        const notCancelled = fireEvent.keyDown(textarea, {
            key: 'Enter',
            shiftKey: true,
        });

        expect(onSubmit).not.toHaveBeenCalled();
        expect(notCancelled).toBe(true);
    });

    it('never sends while an IME composition is open', () => {
        const onKeyDown = vi.fn();
        const { onSubmit, textarea } = renderComposer({ onKeyDown });

        fireEvent.keyDown(textarea, { key: 'Enter', isComposing: true });

        expect(onSubmit).not.toHaveBeenCalled();
        expect(onKeyDown).not.toHaveBeenCalled();
    });

    it('lets the caller take Enter first (a mention pick)', () => {
        const { onSubmit, textarea } = renderComposer({
            onKeyDown: (event) => event.preventDefault(),
        });

        fireEvent.keyDown(textarea, { key: 'Enter' });

        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('does not send when the caller says it cannot', () => {
        const { onSubmit, textarea } = renderComposer({ canSubmit: false });

        fireEvent.keyDown(textarea, { key: 'Enter' });

        expect(onSubmit).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    });

    it('shows Stop while streaming, and Stop never submits', () => {
        const { onSubmit, onStop, textarea } = renderComposer({
            isStreaming: true,
        });

        fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
        fireEvent.keyDown(textarea, { key: 'Enter' });

        expect(onStop).toHaveBeenCalledTimes(1);
        expect(onSubmit).not.toHaveBeenCalled();
        expect(textarea).toBeDisabled();
        expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    });

    it('reports the text and the caret position', () => {
        const { onValueChange, textarea } = renderComposer({ value: '' });

        fireEvent.change(textarea, { target: { value: 'Hi @' } });

        expect(onValueChange).toHaveBeenCalledWith('Hi @', 4);
    });

    it('renders the offline placeholder disabled', () => {
        const { onSubmit, textarea } = renderComposer({
            disabled: true,
            placeholder: 'Assistant offline',
        });

        fireEvent.keyDown(textarea, { key: 'Enter' });

        expect(textarea).toBeDisabled();
        expect(textarea).toHaveAttribute('placeholder', 'Assistant offline');
        expect(onSubmit).not.toHaveBeenCalled();
    });
});
