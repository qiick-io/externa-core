import { useState } from 'react';
import { copyTextToClipboard } from '@/lib/clipboard';

export type CopiedValue = string | null;
export type CopyFn = (text: string) => Promise<boolean>;
export type UseClipboardReturn = [CopiedValue, CopyFn];

/**
 * Tracks the last successfully copied string and exposes a copy helper.
 * Based on the usehooks-ts clipboard pattern.
 *
 * @returns Tuple of `[copiedText, copy]` where `copy` resolves to success/failure
 */
export function useClipboard(): UseClipboardReturn {
    const [copiedText, setCopiedText] = useState<CopiedValue>(null);

    const copy: CopyFn = async (text) => {
        const copied = await copyTextToClipboard(text);

        if (!copied) {
            console.warn('Copy failed');
            setCopiedText(null);

            return false;
        }

        setCopiedText(text);

        return true;
    };

    return [copiedText, copy];
}
