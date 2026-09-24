import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HeaderIconButton } from '@/components/admin/header-icon-button';
import { jsonRequestHeaders } from '@/lib/csrf';
import { toast } from '@/lib/toast';

type Props = {
    collectionId: number;
    itemId: number;
    version: 'draft' | 'published';
    locale?: string | null;
};

/**
 * Opens the configured frontend Live Preview URL (signed token) in a new tab.
 */
export function ItemLivePreviewButton({
    collectionId,
    itemId,
    version,
    locale = null,
}: Props) {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);

    const openPreview = async (): Promise<void> => {
        setLoading(true);

        try {
            const params = new URLSearchParams({ version });

            if (locale) {
                params.set('locale', locale);
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
            };

            if (!res.ok || !body.url) {
                toast.error(
                    body.message ??
                        t('collections.itemToolbar.livePreviewError'),
                );

                return;
            }

            window.open(body.url, '_blank', 'noopener,noreferrer');
        } catch {
            toast.error(t('collections.itemToolbar.livePreviewError'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <HeaderIconButton
            type="button"
            label={t('collections.itemToolbar.livePreview')}
            data-test="live-preview"
            disabled={loading}
            onClick={() => {
                void openPreview();
            }}
        >
            <ExternalLink className="size-4" />
        </HeaderIconButton>
    );
}
