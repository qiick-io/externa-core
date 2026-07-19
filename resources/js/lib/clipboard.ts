/**
 * Copies text using the Clipboard API, falling back to a temporary textarea.
 * `navigator.clipboard` often fails when focus leaves the document (e.g. Radix tooltips)
 * or outside a secure context.
 *
 * @param text - Plain text to copy
 * @returns Whether the copy succeeded
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
    if (text === '') {
        return false;
    }

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);

            return true;
        }
    } catch {
        /* Clipboard API unavailable — try execCommand fallback */
    }

    try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.top = '0';
        textarea.style.left = '0';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        const copied = document.execCommand('copy');
        document.body.removeChild(textarea);

        return copied;
    } catch {
        return false;
    }
}
