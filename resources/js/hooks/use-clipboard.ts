// Credit: https://usehooks-ts.com/
import { useState } from 'react';
import { copyTextToClipboard } from '@/lib/clipboard';

export type CopiedValue = string | null;
export type CopyFn = (text: string) => Promise<boolean>;
export type UseClipboardReturn = [CopiedValue, CopyFn];

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
