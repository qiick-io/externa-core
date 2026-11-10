import { memo, useMemo } from 'react';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { Streamdown, defaultRehypePlugins } from 'streamdown';
import type { StreamdownTranslations } from 'streamdown';
import { shikiCodePlugin } from '@/lib/shiki-code-plugin';
import { cn } from '@/lib/utils';

/*
 * AI Elements `message` → MessageResponse (registry.ai-sdk.dev), in its own
 * file so the Assistant can load Streamdown and shiki on the first answer.
 * Changes from the registry copy: adds the shiki plugin, keeps
 * `rehype-sanitize` after Streamdown's own rehype plugins, and takes its
 * control labels from the app locale.
 */

/** Model output is untrusted: sanitize after Streamdown's own plugins. */
const rehypePlugins = [
    ...Object.values(defaultRehypePlugins),
    [rehypeSanitize, defaultSchema],
] as ComponentProps<typeof Streamdown>['rehypePlugins'];

const plugins = { code: shikiCodePlugin };

const TRANSLATED_KEYS = [
    'copyCode',
    'downloadFile',
    'viewFullscreen',
    'exitFullscreen',
    'copyTable',
    'copyTableAsMarkdown',
    'copyTableAsCsv',
    'copyTableAsTsv',
    'downloadTable',
    'downloadTableAsCsv',
    'downloadTableAsMarkdown',
    'imageNotAvailable',
    'downloadImage',
    'openExternalLink',
    'externalLinkWarning',
    'close',
    'copyLink',
    'copied',
    'openLink',
] as const satisfies ReadonlyArray<keyof StreamdownTranslations>;

/** Streamdown's control labels from the app locale (`ai.markdown.*`). */
function useStreamdownTranslations(): Partial<StreamdownTranslations> {
    const { t } = useTranslation();

    return useMemo(
        () =>
            Object.fromEntries(
                TRANSLATED_KEYS.map((key) => [key, t(`ai.markdown.${key}`)]),
            ),
        // react-i18next returns a new `t` when the language changes.
        [t],
    );
}

export type MessageResponseProps = ComponentProps<typeof Streamdown>;

const StreamdownResponse = memo(
    ({ className, ...props }: MessageResponseProps) => (
        <Streamdown
            className={cn(
                'size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
                className,
            )}
            plugins={plugins}
            rehypePlugins={rehypePlugins}
            {...props}
        />
    ),
    (prevProps, nextProps) =>
        prevProps.children === nextProps.children &&
        prevProps.isAnimating === nextProps.isAnimating &&
        prevProps.translations === nextProps.translations,
);

StreamdownResponse.displayName = 'StreamdownResponse';

export const MessageResponse = (props: MessageResponseProps) => {
    const translations = useStreamdownTranslations();

    return <StreamdownResponse translations={translations} {...props} />;
};
