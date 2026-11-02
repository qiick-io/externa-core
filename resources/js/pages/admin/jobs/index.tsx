import { Head, router } from '@inertiajs/react';
import { TruncatedText } from '@/components/admin/truncated-text';
import { PageLayout, TablePanel } from '@/components/layout/page-layout';
import { Button } from '@/components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { edit as editProfile } from '@/routes/profile';
import type { BreadcrumbItem } from '@/types';

type PendingJob = {
    id: number;
    queue: string;
    display_name: string;
    attempts: number;
    available_at: number;
    created_at: number;
};

type FailedJob = {
    id: number;
    uuid: string;
    queue: string;
    display_name: string;
    exception: string;
    failed_at: string;
};

/**
 * Queue monitor: pending sample + failed jobs with retry/delete.
 */
export default function JobsIndex({
    pending_count,
    pending,
    failed,
    can_manage,
}: {
    pending_count: number;
    pending: PendingJob[];
    failed: FailedJob[];
    can_manage: boolean;
}) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Settings', href: editProfile() },
        { title: 'Jobs', href: '/settings/jobs' },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Jobs" />
            <SettingsLayout wide>
                <PageLayout description={`Pending in queue: ${pending_count}`}>
                    <div className="mb-8 space-y-3">
                        <h2 className="text-lg font-medium">
                            Pending (sample)
                        </h2>
                        <TablePanel>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="text-right">
                                            ID
                                        </TableHead>
                                        <TableHead>Job</TableHead>
                                        <TableHead>Queue</TableHead>
                                        <TableHead className="text-right">
                                            Attempts
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {pending.length === 0 ? (
                                        <TableRow>
                                            <TableCell
                                                colSpan={4}
                                                className="text-muted-foreground"
                                            >
                                                No pending jobs.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        pending.map((job) => (
                                            <TableRow key={job.id}>
                                                <TableCell className="text-right tabular-nums">
                                                    {job.id}
                                                </TableCell>
                                                <TableCell className="max-w-[14rem] font-mono text-xs">
                                                    <TruncatedText
                                                        text={job.display_name}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    {job.queue}
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums">
                                                    {job.attempts}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </TablePanel>
                    </div>

                    <div className="space-y-3">
                        <h2 className="text-lg font-medium">Failed jobs</h2>
                        <TablePanel>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Job</TableHead>
                                        <TableHead>Queue</TableHead>
                                        <TableHead className="text-right">
                                            Failed at
                                        </TableHead>
                                        <TableHead>Exception</TableHead>
                                        <TableHead className="text-right">
                                            Actions
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {failed.length === 0 ? (
                                        <TableRow>
                                            <TableCell
                                                colSpan={5}
                                                className="text-muted-foreground"
                                            >
                                                No failed jobs.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        failed.map((job) => (
                                            <TableRow
                                                key={job.uuid}
                                                className="align-top"
                                            >
                                                <TableCell className="max-w-[14rem] font-mono text-xs">
                                                    <TruncatedText
                                                        text={job.display_name}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    {job.queue}
                                                </TableCell>
                                                <TableCell className="text-right whitespace-nowrap tabular-nums">
                                                    {job.failed_at}
                                                </TableCell>
                                                <TableCell className="max-w-md font-mono text-xs text-muted-foreground">
                                                    <TruncatedText
                                                        text={job.exception}
                                                    />
                                                </TableCell>
                                                <TableCell className="space-x-2 text-right whitespace-nowrap">
                                                    {can_manage ? (
                                                        <>
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() =>
                                                                    router.post(
                                                                        `/settings/jobs/${job.uuid}/retry`,
                                                                    )
                                                                }
                                                            >
                                                                Retry
                                                            </Button>
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="destructive"
                                                                onClick={() =>
                                                                    router.delete(
                                                                        `/settings/jobs/${job.uuid}`,
                                                                    )
                                                                }
                                                            >
                                                                Delete
                                                            </Button>
                                                        </>
                                                    ) : null}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </TablePanel>
                        <p className="text-xs text-muted-foreground">
                            Domain job status (AI import, zip) remains in their
                            existing UIs — this page monitors the Laravel queue
                            tables only.
                        </p>
                    </div>
                </PageLayout>
            </SettingsLayout>
        </AppLayout>
    );
}
