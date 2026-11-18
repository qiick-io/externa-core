import { router } from '@inertiajs/react';
import {
    Check,
    CheckCheck,
    ChevronDown,
    CircleX,
    ClipboardList,
    Clock,
    File,
    FilePen,
    Globe,
    ListChecks,
    RotateCcw,
    Send,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ItemPayload } from '@/components/collections/item-form/item-form-helpers';
import type { ItemWorkflowActions } from '@/components/collections/item-form/use-item-workflow-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useRequestLeave } from '@/hooks/use-unsaved-changes';
import collections from '@/routes/collections';

/**
 * Version switch of a versioned item: the approval badge (published view
 * only) and the Published / Draft select. The draft option's label and icon
 * carry the draft's state (scheduled, in review, approved, rejected, draft,
 * no draft). Switching asks about unsaved changes first.
 */
export function ItemVersionSelect({
    collectionId,
    item,
    contentVersion,
    approvalsRequired,
    approvalStatus,
    hasServerDraft,
}: {
    collectionId: number;
    item: ItemPayload;
    contentVersion: 'published' | 'draft';
    approvalsRequired: boolean;
    approvalStatus: string;
    hasServerDraft: boolean;
}) {
    const { t } = useTranslation();
    const requestLeave = useRequestLeave();
    // ponytail: treat any set publish_at as Scheduled; due rows clear via scheduler
    const isScheduled = Boolean(item.publish_at);
    const draftVersionOption = useMemo((): {
        label: string;
        Icon: LucideIcon;
    } => {
        if (contentVersion === 'draft' && isScheduled) {
            return {
                label: t('collections.itemToolbar.scheduled'),
                Icon: Clock,
            };
        }

        if (approvalsRequired && approvalStatus === 'in_review') {
            return {
                label: t('collections.itemToolbar.inReview'),
                Icon: ClipboardList,
            };
        }

        if (approvalsRequired && approvalStatus === 'approved') {
            return {
                label: t('collections.itemToolbar.approved'),
                Icon: CheckCheck,
            };
        }

        if (approvalsRequired && approvalStatus === 'rejected') {
            return {
                label: t('collections.itemToolbar.rejected'),
                Icon: CircleX,
            };
        }

        if (hasServerDraft) {
            return {
                label: t('collections.itemToolbar.draft'),
                Icon: FilePen,
            };
        }

        return {
            label: t('collections.itemToolbar.draftEmpty'),
            Icon: File,
        };
    }, [
        approvalStatus,
        approvalsRequired,
        contentVersion,
        hasServerDraft,
        isScheduled,
        t,
    ]);
    const DraftVersionIcon = draftVersionOption.Icon;

    return (
        <>
            {/* Status on published view only — on draft, select label carries it. */}
            {approvalsRequired &&
            approvalStatus !== 'draft' &&
            contentVersion === 'published' ? (
                <Badge
                    variant={
                        approvalStatus === 'approved'
                            ? 'default'
                            : approvalStatus === 'rejected'
                              ? 'destructive'
                              : 'secondary'
                    }
                    data-test="approval-status-badge"
                    className="px-2 text-xs"
                >
                    {approvalStatus === 'in_review'
                        ? t('collections.itemToolbar.inReview')
                        : approvalStatus === 'approved'
                          ? t('collections.itemToolbar.approved')
                          : t('collections.itemToolbar.rejected')}
                </Badge>
            ) : null}
            <Select
                value={contentVersion}
                onValueChange={(value) => {
                    if (value !== 'published' && value !== 'draft') {
                        return;
                    }

                    void requestLeave().then((ok) => {
                        if (!ok) {
                            return;
                        }

                        router.get(
                            collections.items.show.url({
                                collection: collectionId,
                                item: item.id,
                            }),
                            { version: value },
                            { preserveScroll: true },
                        );
                    });
                }}
            >
                <SelectTrigger
                    className="w-auto min-w-0"
                    data-test="content-version-select"
                >
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem
                        value="published"
                        textValue={t('collections.itemToolbar.published')}
                    >
                        <Globe className="size-4" />
                        {t('collections.itemToolbar.published')}
                    </SelectItem>
                    <SelectItem
                        value="draft"
                        textValue={draftVersionOption.label}
                    >
                        <DraftVersionIcon className="size-4" />
                        {draftVersionOption.label}
                    </SelectItem>
                </SelectContent>
            </Select>
        </>
    );
}

/**
 * "Actions" menu on an item's draft: approve / reject (reviewers, while in
 * review), submit for review (draft or rejected), publish (blocked until
 * approved when approvals are required) and discard the draft.
 */
export function ItemVersionActionsMenu({
    item,
    canApproveNow,
    canSubmitNow,
    publishBlockedByApproval,
    workflow,
}: {
    item: ItemPayload;
    canApproveNow: boolean;
    canSubmitNow: boolean;
    publishBlockedByApproval: boolean;
    workflow: ItemWorkflowActions;
}) {
    const { t } = useTranslation();

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    data-test="item-version-actions"
                >
                    <ListChecks className="size-4" />
                    {t('collections.itemToolbar.actions')}
                    <ChevronDown className="size-3.5 opacity-80" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
                {canApproveNow ? (
                    <>
                        <DropdownMenuItem
                            disabled={workflow.isApproving}
                            className="items-start"
                            data-test="approve-item"
                            onClick={workflow.approve}
                        >
                            <Check className="mt-0.5" />
                            <span className="flex flex-col gap-0.5">
                                <span>
                                    {t('collections.itemToolbar.approve')}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {t(
                                        'collections.itemToolbar.approveDescription',
                                    )}
                                </span>
                            </span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className="items-start"
                            data-test="reject-item"
                            onClick={() =>
                                workflow.openReject(item.rejection_note)
                            }
                        >
                            <CircleX className="mt-0.5" />
                            <span className="flex flex-col gap-0.5">
                                <span>
                                    {t('collections.itemToolbar.reject')}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {t(
                                        'collections.itemToolbar.rejectDescription',
                                    )}
                                </span>
                            </span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                    </>
                ) : null}
                {canSubmitNow ? (
                    <>
                        <DropdownMenuItem
                            disabled={workflow.isSubmittingReview}
                            data-test="submit-for-review"
                            onClick={workflow.submitForReview}
                        >
                            <Send />
                            {t('collections.itemToolbar.submitForReview')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                    </>
                ) : null}
                <DropdownMenuItem
                    disabled={workflow.isPublishing || publishBlockedByApproval}
                    className={
                        publishBlockedByApproval ? 'items-start' : undefined
                    }
                    data-test="publish-item"
                    onClick={() => {
                        if (publishBlockedByApproval) {
                            return;
                        }

                        workflow.setIsPublishOpen(true);
                    }}
                >
                    <Globe
                        className={
                            publishBlockedByApproval ? 'mt-0.5' : undefined
                        }
                    />
                    {publishBlockedByApproval ? (
                        <span className="flex flex-col gap-0.5">
                            <span>{t('collections.itemToolbar.publish')}</span>
                            <span className="text-xs text-muted-foreground">
                                {t(
                                    'collections.itemToolbar.approveBeforePublish',
                                )}
                            </span>
                        </span>
                    ) : (
                        t('collections.itemToolbar.publish')
                    )}
                </DropdownMenuItem>
                <DropdownMenuItem
                    disabled={workflow.isDiscardingDraft}
                    variant="destructive"
                    data-test="discard-server-draft"
                    onClick={() => workflow.setIsDiscardDraftOpen(true)}
                >
                    <RotateCcw />
                    {t('collections.itemToolbar.discardDraft')}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
