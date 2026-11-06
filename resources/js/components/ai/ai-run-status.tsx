import { useTranslation } from 'react-i18next';
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker';
import { Spinner } from '@/components/ui/spinner';
import type { AiImportJobStatus } from '@/lib/ai-chat';

/**
 * Status line under the AI thread while a tool runs ("Calling search_items…").
 *
 * @param props.toolName - Tool the model is running, or null when none
 */
export function AiToolRunningMarker({ toolName }: { toolName: string | null }) {
    const { t } = useTranslation();

    if (!toolName) {
        return null;
    }

    return (
        <Marker role="status" data-test="ai-tool-running">
            <MarkerIcon>
                <Spinner />
            </MarkerIcon>
            <MarkerContent className="shimmer">
                {t('ai.callingTool', { tool: toolName })}
            </MarkerContent>
        </Marker>
    );
}

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
