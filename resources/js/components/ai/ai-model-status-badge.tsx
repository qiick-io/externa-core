import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';

export type AiModelStatus =
    | 'recommended'
    | 'supported'
    | 'deprecated'
    | 'unverified';

const variantByStatus = {
    recommended: 'success',
    supported: 'info',
    deprecated: 'warning',
    unverified: 'muted',
} as const;

/**
 * Catalog status of an AI model (#370): recommended, supported, deprecated, or unverified for
 * local and custom models the catalog does not list.
 */
export function AiModelStatusBadge({ status }: { status: AiModelStatus }) {
    const { t } = useTranslation();

    return (
        <Badge
            variant={variantByStatus[status]}
            data-test={`ai-model-status-${status}`}
        >
            {t(`settings.aiTools.models.status.${status}`)}
        </Badge>
    );
}
