import { useTranslation } from 'react-i18next';
import { DatetimeLocalPicker } from '@/components/collections/item-field-date-input';
import type { ItemPayload } from '@/components/collections/item-form/item-form-helpers';
import type { useItemSchedule } from '@/components/collections/item-form/use-item-schedule';
import { Button } from '@/components/ui/button';
import { toDatetimeLocalValue } from '@/lib/format';

/**
 * Alert shown when the scheduler failed to publish the item, with the
 * server's error and whether the unpublish date was kept.
 */
export function ItemScheduleFailureAlert({
    scheduleError,
    unpublishAt,
}: {
    scheduleError: string;
    unpublishAt: string | null | undefined;
}) {
    const { t } = useTranslation();

    return (
        <div
            className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-3 text-sm text-destructive"
            data-test="item-schedule-failure"
            role="alert"
        >
            <p className="font-medium">
                {t('collections.itemSchedule.failureTitle')}
            </p>
            <p className="mt-1 text-destructive/90">{scheduleError}</p>
            {unpublishAt ? (
                <p className="mt-1 text-xs text-destructive/80">
                    {t('collections.itemSchedule.failureUnpublishKept')}
                </p>
            ) : null}
        </div>
    );
}

/**
 * Publish / unpublish dates of a versioned item. On the published version the
 * publish date is read-only (when it was published) and only the unpublish
 * date can be scheduled.
 */
export function ItemSchedulePanel({
    item,
    viewingPublished,
    schedule,
}: {
    item: ItemPayload;
    viewingPublished: boolean;
    schedule: ReturnType<typeof useItemSchedule>;
}) {
    const { t } = useTranslation();

    return (
        <div
            className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-sidebar-border/70 bg-muted/20 px-3 py-3 text-sm dark:border-sidebar-border"
            data-test="item-schedule-panel"
        >
            {viewingPublished ? (
                <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">
                        {t('collections.itemSchedule.publishedAt')}
                    </span>
                    {item.published_at ? (
                        <DatetimeLocalPicker
                            value={toDatetimeLocalValue(item.published_at)}
                            data-test="schedule-published-at"
                            disabled
                            placeholder={t(
                                'collections.itemSchedule.pickDateTime',
                            )}
                            clearLabel={t(
                                'collections.itemSchedule.clearField',
                            )}
                            onChange={() => {}}
                        />
                    ) : (
                        <span
                            className="flex h-control min-w-[12.5rem] items-center text-sm text-muted-foreground"
                            data-test="schedule-already-published"
                        >
                            {t('collections.itemSchedule.alreadyPublished')}
                        </span>
                    )}
                </div>
            ) : (
                <label className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">
                        {t('collections.itemSchedule.publishAt')}
                    </span>
                    <DatetimeLocalPicker
                        value={schedule.publishAtLocal}
                        data-test="schedule-publish-at"
                        placeholder={t('collections.itemSchedule.pickDateTime')}
                        clearLabel={t('collections.itemSchedule.clearField')}
                        onChange={schedule.setPublishAtLocal}
                    />
                </label>
            )}
            <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">
                    {t('collections.itemSchedule.unpublishAt')}
                </span>
                <DatetimeLocalPicker
                    value={schedule.unpublishAtLocal}
                    data-test="schedule-unpublish-at"
                    placeholder={t('collections.itemSchedule.pickDateTime')}
                    clearLabel={t('collections.itemSchedule.clearField')}
                    onChange={schedule.setUnpublishAtLocal}
                />
            </label>
            <Button
                type="button"
                variant="secondary"
                disabled={schedule.isScheduling}
                data-test="schedule-save"
                onClick={schedule.saveSchedule}
            >
                {t('collections.itemSchedule.save')}
            </Button>
            {(viewingPublished
                ? item.unpublish_at
                : item.publish_at || item.unpublish_at) && (
                <Button
                    type="button"
                    variant="outline"
                    disabled={schedule.isScheduling}
                    data-test="schedule-clear"
                    onClick={schedule.clearSchedule}
                >
                    {t('collections.itemSchedule.cancel')}
                </Button>
            )}
        </div>
    );
}
