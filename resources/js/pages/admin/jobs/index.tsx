import { Head, Link, router } from '@inertiajs/react';
import { PageLayout, TablePanel } from '@/components/layout/page-layout';
import { Button } from '@/components/ui/button';
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
                        <h2 className="text-lg font-medium">Pending (sample)</h2>
                        <TablePanel>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left">
                                        <th className="p-2">ID</th>
                                        <th className="p-2">Job</th>
                                        <th className="p-2">Queue</th>
                                        <th className="p-2">Attempts</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pending.length === 0 ? (
                                        <tr>
                                            <td
                                                colSpan={4}
                                                className="p-3 text-muted-foreground"
                                            >
                                                No pending jobs.
                                            </td>
                                        </tr>
                                    ) : (
                                        pending.map((job) => (
                                            <tr
                                                key={job.id}
                                                className="border-b last:border-0"
                                            >
                                                <td className="p-2">{job.id}</td>
                                                <td className="p-2 font-mono text-xs">
                                                    {job.display_name}
                                                </td>
                                                <td className="p-2">{job.queue}</td>
                                                <td className="p-2">{job.attempts}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </TablePanel>
                    </div>

                    <div className="space-y-3">
                        <h2 className="text-lg font-medium">Failed jobs</h2>
                        <TablePanel>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left">
                                        <th className="p-2">Job</th>
                                        <th className="p-2">Queue</th>
                                        <th className="p-2">Failed at</th>
                                        <th className="p-2">Exception</th>
                                        <th className="p-2 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {failed.length === 0 ? (
                                        <tr>
                                            <td
                                                colSpan={5}
                                                className="p-3 text-muted-foreground"
                                            >
                                                No failed jobs.
                                            </td>
                                        </tr>
                                    ) : (
                                        failed.map((job) => (
                                            <tr
                                                key={job.uuid}
                                                className="border-b last:border-0 align-top"
                                            >
                                                <td className="p-2 font-mono text-xs">
                                                    {job.display_name}
                                                </td>
                                                <td className="p-2">{job.queue}</td>
                                                <td className="p-2 whitespace-nowrap">
                                                    {job.failed_at}
                                                </td>
                                                <td className="max-w-md p-2 font-mono text-xs text-muted-foreground">
                                                    {job.exception}
                                                </td>
                                                <td className="space-x-2 p-2 text-right whitespace-nowrap">
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
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
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
