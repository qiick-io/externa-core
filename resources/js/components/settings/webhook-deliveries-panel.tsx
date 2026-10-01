import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import type {
    WebhookDeliveryEntry,
    WebhookDeliverySummary,
    WebhookEventCatalogEntry,
} from '@/types';

function formatAt(value: string): string {
    return new Date(value).toLocaleString();
}

function DeliveryCard({
    title,
    entry,
    tone,
    dataTest,
}: {
    title: string;
    entry: WebhookDeliveryEntry | null;
    tone: 'success' | 'error';
    dataTest: string;
}) {
    const { t } = useTranslation();

    return (
        <div className="space-y-1 rounded-md border p-3" data-test={dataTest}>
            <p className="text-sm font-medium">{title}</p>
            {entry === null ? (
                <p className="text-sm text-muted-foreground">
                    {t('settings.project.webhookDeliveryNone')}
                </p>
            ) : (
                <>
                    <p className="text-sm">
                        <code className="font-mono">{entry.type}</code>{' '}
                        <span className="text-muted-foreground">
                            · {formatAt(entry.at)}
                        </span>
                    </p>
                    {tone === 'error' && entry.message ? (
                        <p className="text-sm break-words text-destructive">
                            {entry.message}
                        </p>
                    ) : null}
                    <p className="font-mono text-xs text-muted-foreground">
                        {entry.event_id} ·{' '}
                        {t('settings.project.webhookDeliveryAttempts', {
                            count: entry.attempts,
                        })}
                        {entry.status !== null ? ` · HTTP ${entry.status}` : ''}
                    </p>
                </>
            )}
        </div>
    );
}

/**
 * Last success / last error cards plus the recent delivery ring buffer.
 */
export function WebhookDeliveryStatus({
    deliveries,
}: {
    deliveries: WebhookDeliverySummary;
}) {
    const { t } = useTranslation();

    return (
        <div className="grid gap-3">
            <Label>{t('settings.project.webhookDeliveryTitle')}</Label>
            <div className="grid gap-3 sm:grid-cols-2">
                <DeliveryCard
                    title={t('settings.project.webhookLastSuccess')}
                    entry={deliveries.last_success}
                    tone="success"
                    dataTest="project-webhook-last-success"
                />
                <DeliveryCard
                    title={t('settings.project.webhookLastError')}
                    entry={deliveries.last_error}
                    tone="error"
                    dataTest="project-webhook-last-error"
                />
            </div>
            {deliveries.recent.length > 0 ? (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>
                                {t('settings.project.webhookDeliveryWhen')}
                            </TableHead>
                            <TableHead>
                                {t('settings.project.webhookEventType')}
                            </TableHead>
                            <TableHead>
                                {t('settings.project.webhookDeliveryOutcome')}
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {deliveries.recent.map((entry) => (
                            <TableRow key={`${entry.event_id}-${entry.at}`}>
                                <TableCell className="whitespace-nowrap text-muted-foreground">
                                    {formatAt(entry.at)}
                                </TableCell>
                                <TableCell>
                                    <code className="font-mono">
                                        {entry.type}
                                    </code>
                                </TableCell>
                                <TableCell>
                                    <Badge
                                        variant={
                                            entry.outcome === 'success'
                                                ? 'secondary'
                                                : 'destructive'
                                        }
                                        title={entry.message ?? undefined}
                                    >
                                        {entry.outcome === 'success'
                                            ? t(
                                                  'settings.project.webhookOutcomeSuccess',
                                              )
                                            : t(
                                                  'settings.project.webhookOutcomeFailed',
                                              )}
                                    </Badge>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            ) : null}
        </div>
    );
}

/**
 * Read-only table of the frozen outbound event catalog.
 */
export function WebhookEventCatalog({
    events,
}: {
    events: WebhookEventCatalogEntry[];
}) {
    const { t } = useTranslation();

    return (
        <div className="grid gap-2">
            <Label>{t('settings.project.webhookEventsTitle')}</Label>
            <Table data-test="project-webhook-events">
                <TableHeader>
                    <TableRow>
                        <TableHead>
                            {t('settings.project.webhookEventType')}
                        </TableHead>
                        <TableHead>
                            {t('settings.project.webhookEventDescription')}
                        </TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {events.map((event) => (
                        <TableRow key={event.type}>
                            <TableCell className="whitespace-nowrap">
                                <code className="font-mono">{event.type}</code>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                                {event.description}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
