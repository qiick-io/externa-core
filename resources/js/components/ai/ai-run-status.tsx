import { useTranslation } from 'react-i18next';
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker';
import { Spinner } from '@/components/ui/spinner';
import type { AiImportJobStatus } from '@/lib/ai-chat';

/**
 * Progress of a background AI import job ("Import running: 40/120 — …").
 *
 * @param props.status - Latest polled job status, or null when none
 */
export function AiImportJobMarker({
    status,
}: {
    status: AiImportJobStatus | null;
}) {
    const { t } = useTranslation();

    if (!status) {
        return null;
    }

    const isActive = status.status === 'queued' || status.status === 'running';

    return (
        <Marker role="status" data-test="ai-import-status">
            {isActive ? (
                <MarkerIcon>
                    <Spinner />
                </MarkerIcon>
            ) : null}
            <MarkerContent>
                {t('ai.importStatus', {
                    status: t(`ai.importState.${status.status}`),
                    progress:
                        status.total !== null
                            ? `${status.processed}/${status.total}`
                            : String(status.processed),
                    message: status.message,
                })}
            </MarkerContent>
        </Marker>
    );
}
