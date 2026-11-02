import { CalendarClock, ExternalLink } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HeaderIconButton } from '@/components/admin/header-icon-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { jsonRequestHeaders } from '@/lib/csrf';
import { toast } from '@/lib/toast';

type Props = {
    collectionId: number;
    itemId: number;
    version: 'draft' | 'published';
    locale?: string | null;
};

const MAX_AHEAD_DAYS = 90;

/**
 * Opens the configured frontend Live Preview URL (signed token) in a new tab.
 * Optional “Preview at…” picks a point-in-time claim (scheduled publish overlay).
 */
export function ItemLivePreviewButton({
    collectionId,
    itemId,
    version,
    locale = null,
}: Props) {
    const { t } = useTranslation();
    const asOfFieldId = useId();
    const [loading, setLoading] = useState(false);
    const [asOfOpen, setAsOfOpen] = useState(false);
    const [asOfLocal, setAsOfLocal] = useState('');

    const openPreview = async (asOfIso: string | null): Promise<void> => {
        setLoading(true);

        try {
            const params = new URLSearchParams({ version });

            if (locale) {
                params.set('locale', locale);
            }

            if (asOfIso) {
                params.set('as_of', asOfIso);
            }

            const res = await fetch(
                `/collections/${collectionId}/items/${itemId}/live-preview-url?${params}`,
                {
                    headers: jsonRequestHeaders(),
                    credentials: 'same-origin',
                },
            );
            const body = (await res.json().catch(() => ({}))) as {
                url?: string;
                message?: string;
                errors?: { as_of?: string[] };
            };

            if (!res.ok || !body.url) {
                const asOfError = body.errors?.as_of?.[0];
                toast.error(
                    asOfError ??
                        body.message ??
                        t('collections.itemToolbar.livePreviewError'),
                );

                return;
            }

            window.open(body.url, '_blank', 'noopener,noreferrer');
            setAsOfOpen(false);
        } catch {
            toast.error(t('collections.itemToolbar.livePreviewError'));
        } finally {
            setLoading(false);
        }
    };

    const openAsOfPreview = (): void => {
        if (!asOfLocal) {
            toast.error(t('collections.itemToolbar.livePreviewAtInvalid'));

            return;
        }

        const chosen = new Date(asOfLocal);
        if (Number.isNaN(chosen.getTime())) {
            toast.error(t('collections.itemToolbar.livePreviewAtInvalid'));

            return;
        }

        const max = Date.now() + MAX_AHEAD_DAYS * 24 * 60 * 60 * 1000;
        if (chosen.getTime() > max) {
            toast.error(t('collections.itemToolbar.livePreviewAtInvalid'));

            return;
        }

        void openPreview(chosen.toISOString());
    };

    const asOfLabel = t('collections.itemToolbar.livePreviewAt');

    return (
        <>
            <HeaderIconButton
                type="button"
                label={t('collections.itemToolbar.livePreview')}
                data-test="live-preview"
                disabled={loading}
                onClick={() => {
                    void openPreview(null);
                }}
            >
                <ExternalLink className="size-4" />
            </HeaderIconButton>
            <Popover open={asOfOpen} onOpenChange={setAsOfOpen}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <PopoverTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={asOfLabel}
                                data-test="live-preview-as-of"
                                disabled={loading}
                            >
                                <CalendarClock className="size-4" />
                            </Button>
                        </PopoverTrigger>
                    </TooltipTrigger>
                    <TooltipContent>{asOfLabel}</TooltipContent>
                </Tooltip>
                <PopoverContent className="w-72 space-y-3" align="end">
                    <div className="space-y-1">
                        <p className="text-sm font-medium">{asOfLabel}</p>
                        <p className="text-xs text-muted-foreground">
                            {t('collections.itemToolbar.livePreviewAtHint')}
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor={asOfFieldId}>{asOfLabel}</Label>
                        <Input
                            id={asOfFieldId}
                            type="datetime-local"
                            value={asOfLocal}
                            data-test="live-preview-as-of-input"
                            onChange={(event) =>
                                setAsOfLocal(event.target.value)
                            }
                        />
                    </div>
                    <Button
                        type="button"
                        className="w-full"
                        disabled={loading}
                        data-test="live-preview-as-of-open"
                        onClick={openAsOfPreview}
                    >
                        {t('collections.itemToolbar.livePreviewAtOpen')}
                    </Button>
                </PopoverContent>
            </Popover>
        </>
    );
}
