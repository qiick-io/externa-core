import { CalendarClock, ExternalLink } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HeaderIconButton } from '@/components/admin/header-icon-button';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
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
import ItemLivePreviewDraftController from '@/actions/App/Http/Controllers/Collections/ItemLivePreviewDraftController';
import { formRequestHeaders, jsonRequestHeaders } from '@/lib/csrf';
import { toast } from '@/lib/toast';

type Props = {
    collectionId: number;
    /** Saved item, or `null` on the create form: the unsaved form state is previewed instead. */
    itemId: number | null;
    /** Create form whose current values are previewed when `itemId` is `null`. */
    formId?: string;
    version: 'draft' | 'published';
    locale?: string | null;
};

const MAX_AHEAD_DAYS = 90;

/**
 * Posts the create form's current values to the unsaved-draft preview stash (no item is created).
 */
function requestUnsavedPreviewUrl(
    collectionId: number,
    formId: string | undefined,
    locale: string | null,
): Promise<Response> {
    const form = formId
        ? (document.getElementById(formId) as HTMLFormElement | null)
        : null;
    const payload = form ? new FormData(form) : new FormData();

    if (locale) {
        payload.set('locale', locale);
    }

    return fetch(ItemLivePreviewDraftController.store.url(collectionId), {
        method: 'POST',
        headers: formRequestHeaders(),
        credentials: 'same-origin',
        body: payload,
    });
}

/**
 * Opens the configured frontend Live Preview URL (signed token) in a new tab.
 * Optional “Preview at…” picks a point-in-time claim (scheduled publish overlay).
 *
 * On the create form (`itemId` null) it previews the unsaved form state and revokes that
 * preview when the editor leaves the form; saving revokes it on the server too.
 */
export function ItemLivePreviewButton({
    collectionId,
    itemId,
    formId,
    version,
    locale = null,
}: Props) {
    const { t } = useTranslation();
    const asOfFieldId = useId();
    const [loading, setLoading] = useState(false);
    const [asOfOpen, setAsOfOpen] = useState(false);
    const [asOfLocal, setAsOfLocal] = useState('');
    /** Validation message under the date field (app-ui `docs/notifications.md`: not a toast). */
    const [asOfError, setAsOfError] = useState<string | null>(null);
    const hasUnsavedPreviewRef = useRef(false);
    const isUnsaved = itemId === null;

    useEffect(() => {
        if (!isUnsaved) {
            return;
        }

        const revokeUnsavedPreview = (): void => {
            if (!hasUnsavedPreviewRef.current) {
                return;
            }

            hasUnsavedPreviewRef.current = false;
            void fetch(
                ItemLivePreviewDraftController.destroy.url(collectionId),
                {
                    method: 'DELETE',
                    headers: jsonRequestHeaders(),
                    credentials: 'same-origin',
                    keepalive: true,
                },
            ).catch(() => undefined);
        };

        window.addEventListener('pagehide', revokeUnsavedPreview);

        return () => {
            window.removeEventListener('pagehide', revokeUnsavedPreview);
            revokeUnsavedPreview();
        };
    }, [collectionId, isUnsaved]);

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

            const res = isUnsaved
                ? await requestUnsavedPreviewUrl(collectionId, formId, locale)
                : await fetch(
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
                const serverAsOfError = body.errors?.as_of?.[0];

                if (asOfIso && serverAsOfError) {
                    setAsOfError(serverAsOfError);

                    return;
                }

                toast.error(
                    body.message ??
                        t('collections.itemToolbar.livePreviewError'),
                );

                return;
            }

            if (isUnsaved) {
                hasUnsavedPreviewRef.current = true;
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
            setAsOfError(t('collections.itemToolbar.livePreviewAtInvalid'));

            return;
        }

        const chosen = new Date(asOfLocal);

        if (Number.isNaN(chosen.getTime())) {
            setAsOfError(t('collections.itemToolbar.livePreviewAtInvalid'));

            return;
        }

        const max = Date.now() + MAX_AHEAD_DAYS * 24 * 60 * 60 * 1000;

        if (chosen.getTime() > max) {
            setAsOfError(t('collections.itemToolbar.livePreviewAtInvalid'));

            return;
        }

        void openPreview(chosen.toISOString());
    };

    const asOfLabel = t('collections.itemToolbar.livePreviewAt');

    return (
        <>
            <HeaderIconButton
                type="button"
                label={
                    isUnsaved
                        ? t('collections.itemToolbar.livePreviewUnsaved')
                        : t('collections.itemToolbar.livePreview')
                }
                data-test="live-preview"
                disabled={loading}
                onClick={() => {
                    void openPreview(null);
                }}
            >
                <ExternalLink className="size-4" />
            </HeaderIconButton>
            {!isUnsaved && (
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
                                aria-invalid={asOfError !== null}
                                aria-describedby={
                                    asOfError !== null
                                        ? `${asOfFieldId}-error`
                                        : undefined
                                }
                                onChange={(event) => {
                                    setAsOfLocal(event.target.value);
                                    setAsOfError(null);
                                }}
                            />
                            <FieldError id={`${asOfFieldId}-error`}>
                                {asOfError}
                            </FieldError>
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
            )}
        </>
    );
}
