import { GlobeIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
    Trace,
    TraceCollapsible,
    TraceCollapsibleContent,
    TraceCollapsibleTrigger,
    TraceIcon,
    TraceLine,
    TraceTitle,
} from '@/components/ui/trace';

/*
 * AI Elements `sources` as shadcn rebuilt it on Trace
 * (ui.shadcn.com/docs/ai-elements/base/sources): "Used N sources", opening to
 * one link per source (new tab). Duplicate URLs are dropped and a source
 * without a title shows its host name. The label goes through i18n
 * (`ai.sources.used`). Render it inside a `Trace`.
 */

export type SourceLink = { url: string; title: string | null };

export type SourcesProps = { sources: SourceLink[] };

const hostName = (url: string): string => {
    try {
        return new URL(url).hostname;
    } catch {
        return url;
    }
};

export const Sources = ({ sources }: SourcesProps) => {
    const { t } = useTranslation();
    const uniqueSources = sources.filter(
        (source, index) =>
            sources.findIndex((other) => other.url === source.url) === index,
    );

    if (uniqueSources.length === 0) {
        return null;
    }

    return (
        <TraceCollapsible>
            <TraceCollapsibleTrigger>
                <TraceLine>
                    <TraceIcon>
                        <GlobeIcon />
                    </TraceIcon>
                    <TraceTitle>
                        {t('ai.sources.used', { count: uniqueSources.length })}
                    </TraceTitle>
                </TraceLine>
            </TraceCollapsibleTrigger>
            <TraceCollapsibleContent>
                <Trace>
                    {uniqueSources.map((source) => (
                        <a
                            key={source.url}
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                        >
                            <TraceLine>
                                <TraceTitle>
                                    {source.title ?? hostName(source.url)}
                                </TraceTitle>
                            </TraceLine>
                        </a>
                    ))}
                </Trace>
            </TraceCollapsibleContent>
        </TraceCollapsible>
    );
};
