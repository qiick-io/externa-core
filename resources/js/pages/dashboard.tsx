import { Deferred, Head, Link } from '@inertiajs/react';
import AppLayout from '@/layouts/app-layout';
import { dashboard } from '@/routes';
import adminRoutes from '@/lib/admin-routes';
import { PageLayout } from '@/components/layout/page-layout';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import type { BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Dashboard',
        href: dashboard(),
    },
];

type LatestActivityItem = {
    id: number;
    log_name: string | null;
    event: string | null;
    description: string;
    created_at: string | null;
    causer: { id: number; label: string } | null;
    subject: { type: string | null; id: number; label: string } | null;
};

type MostActiveUser = {
    id: number;
    label: string;
    activity_count: number;
};

type SuspiciousEventItem = {
    id: number;
    log_name: string | null;
    event: string | null;
    description: string;
    created_at: string | null;
    causer: { id: number; label: string } | null;
};

type StuckOrphanUploadItem = {
    id: number;
    upload_id: string;
    file_name: string;
    disk: string;
    parent_id: number | null;
    total_size: number;
    uploaded_chunks: number;
    total_chunks: number;
    expires_at: string | null;
    created_at: string | null;
};

type LargestFileItem = {
    id: number;
    name: string;
    path: string;
    disk: string;
    size: number;
    created_at: string | null;
};

type StorageTrendItem = {
    date: string;
    bytes_added: number;
};

type DashboardProps = {
    latestActivity: LatestActivityItem[];
    fileStats: { files_count: number; folders_count: number; files_size_sum: number };
    uploadHealth: { in_progress_count: number; stale_count: number };
    mostActiveUsers: MostActiveUser[];
    suspiciousEvents: SuspiciousEventItem[];
    stuckOrphanUploads: StuckOrphanUploadItem[];
    largestFiles?: LargestFileItem[];
    fileStatsByDisk?: { disk: string; files_count: number; files_size_sum: number }[];
    storageTrend?: StorageTrendItem[];
};

function formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let unitIndex = 0;
    let value = bytes;

    while (value >= 1024 && unitIndex < units.length - 1) {
        value = value / 1024;
        unitIndex += 1;
    }

    const rounded = unitIndex === 0 ? value.toFixed(0) : value.toFixed(1);
    return `${rounded} ${units[unitIndex]}`;
}

export default function Dashboard({
    latestActivity,
    fileStats,
    uploadHealth,
    mostActiveUsers,
    suspiciousEvents,
    stuckOrphanUploads,
    largestFiles,
    fileStatsByDisk,
    storageTrend,
}: DashboardProps) {
    const storageTrendRows = (storageTrend ?? []).slice(-14);
    const fileStatsByDiskRows = (fileStatsByDisk ?? []).slice(0, 8);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Dashboard" />
            <PageLayout
                description="Overview of recent activity, storage usage, and upload health."
                scrollContent
            >
                <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-12">
                    <div className="grid min-h-0 grid-cols-1 gap-4 lg:col-span-5 lg:grid-rows-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                        <Card className="flex min-h-0 flex-col">
                            <CardHeader className="pb-3">
                                <CardTitle>Latest activity</CardTitle>
                                <CardDescription>
                                    Last 10 events across the app.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
                                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border">
                                    <div className="min-h-0 flex-1 overflow-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="w-[7rem]">
                                                        Event
                                                    </TableHead>
                                                    <TableHead>Description</TableHead>
                                                    <TableHead className="w-[10rem] text-right">
                                                        When
                                                    </TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {latestActivity.map((activity) => (
                                                    <TableRow key={activity.id}>
                                                        <TableCell className="text-muted-foreground">
                                                            {activity.event ?? '—'}
                                                        </TableCell>
                                                        <TableCell className="min-w-0">
                                                            <div className="truncate font-medium">
                                                                {activity.description}
                                                            </div>
                                                            <div className="text-muted-foreground truncate text-xs">
                                                                {activity.causer?.label
                                                                    ? `by ${activity.causer.label}`
                                                                    : '—'}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-muted-foreground text-right text-xs">
                                                            {activity.created_at
                                                                ? new Date(
                                                                      activity.created_at,
                                                                  ).toLocaleString()
                                                                : '—'}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                                {latestActivity.length === 0 ? (
                                                    <TableRow>
                                                        <TableCell
                                                            className="text-muted-foreground py-6 text-center"
                                                            colSpan={3}
                                                        >
                                                            No activity yet.
                                                        </TableCell>
                                                    </TableRow>
                                                ) : null}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>
                                <div className="flex shrink-0 justify-end">
                                    <Link
                                        href={adminRoutes.activityLogs.index()}
                                        className="text-sm underline underline-offset-4"
                                    >
                                        View all
                                    </Link>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="flex min-h-0 flex-col">
                            <CardHeader className="pb-3">
                                <CardTitle>Suspicious events</CardTitle>
                                <CardDescription>
                                    Failed events from the last hour.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="flex min-h-0 flex-1 flex-col">
                                <div className="min-h-0 flex-1 overflow-hidden rounded-md border">
                                    <div className="min-h-0 overflow-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Description</TableHead>
                                                    <TableHead className="w-[10rem] text-right">
                                                        When
                                                    </TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {suspiciousEvents.map((event) => (
                                                    <TableRow key={event.id}>
                                                        <TableCell className="min-w-0">
                                                            <div className="truncate font-medium">
                                                                {event.description}
                                                            </div>
                                                            <div className="text-muted-foreground truncate text-xs">
                                                                {event.causer?.label
                                                                    ? `by ${event.causer.label}`
                                                                    : '—'}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-muted-foreground text-right text-xs">
                                                            {event.created_at
                                                                ? new Date(
                                                                      event.created_at,
                                                                  ).toLocaleString()
                                                                : '—'}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                                {suspiciousEvents.length === 0 ? (
                                                    <TableRow>
                                                        <TableCell
                                                            className="text-muted-foreground py-6 text-center"
                                                            colSpan={2}
                                                        >
                                                            No suspicious events.
                                                        </TableCell>
                                                    </TableRow>
                                                ) : null}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            <Card className="flex flex-col">
                                <CardHeader className="pb-3">
                                    <CardTitle>Most active users</CardTitle>
                                    <CardDescription>
                                        Top 5 in the last 24 hours.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="min-h-0 flex-1">
                                    <div className="min-h-0 overflow-hidden rounded-md border">
                                        <div className="min-h-0 overflow-auto">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>User</TableHead>
                                                        <TableHead className="w-[6rem] text-right">
                                                            Events
                                                        </TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {mostActiveUsers.map((user) => (
                                                        <TableRow key={user.id}>
                                                            <TableCell className="font-medium">
                                                                {user.label}
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                {user.activity_count.toLocaleString()}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                    {mostActiveUsers.length === 0 ? (
                                                        <TableRow>
                                                            <TableCell
                                                                className="text-muted-foreground py-6 text-center"
                                                                colSpan={2}
                                                            >
                                                                No activity yet.
                                                            </TableCell>
                                                        </TableRow>
                                                    ) : null}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="flex flex-col">
                                <CardHeader className="pb-3">
                                    <CardTitle>Stuck/orphan uploads</CardTitle>
                                    <CardDescription>
                                        Incomplete, expired, or missing parent.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="min-h-0 flex-1">
                                    <div className="min-h-0 overflow-hidden rounded-md border">
                                        <div className="min-h-0 overflow-auto">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Upload</TableHead>
                                                        <TableHead className="w-[6rem] text-right">
                                                            Chunks
                                                        </TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {stuckOrphanUploads.map(
                                                        (upload) => (
                                                            <TableRow
                                                                key={upload.id}
                                                            >
                                                                <TableCell className="min-w-0">
                                                                    <div className="truncate font-medium">
                                                                        {upload.file_name}
                                                                    </div>
                                                                    <div className="text-muted-foreground truncate text-xs">
                                                                        {upload.disk}{' '}
                                                                        ·{' '}
                                                                        {upload.parent_id
                                                                            ? `parent #${upload.parent_id}`
                                                                            : 'no parent'}
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell className="text-right text-xs text-muted-foreground">
                                                                    {upload.uploaded_chunks.toLocaleString()}
                                                                    /
                                                                    {upload.total_chunks.toLocaleString()}
                                                                </TableCell>
                                                            </TableRow>
                                                        ),
                                                    )}
                                                    {stuckOrphanUploads.length ===
                                                    0 ? (
                                                        <TableRow>
                                                            <TableCell
                                                                className="text-muted-foreground py-6 text-center"
                                                                colSpan={2}
                                                            >
                                                                No stuck uploads.
                                                            </TableCell>
                                                        </TableRow>
                                                    ) : null}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>

                    <div className="flex min-h-0 flex-col gap-4 lg:col-span-7 lg:h-full">
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            <Card className="flex min-h-0 flex-col">
                                <CardHeader className="pb-3">
                                    <CardTitle>Storage overview</CardTitle>
                                    <CardDescription>
                                        Files, folders, and total size.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="grid grid-cols-3 gap-3">
                                    <div>
                                        <div className="text-muted-foreground text-xs">
                                            Files
                                        </div>
                                        <div className="text-2xl font-semibold">
                                            {fileStats.files_count.toLocaleString()}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-muted-foreground text-xs">
                                            Folders
                                        </div>
                                        <div className="text-2xl font-semibold">
                                            {fileStats.folders_count.toLocaleString()}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-muted-foreground text-xs">
                                            Total size
                                        </div>
                                        <div className="text-2xl font-semibold">
                                            {formatBytes(
                                                fileStats.files_size_sum,
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="flex min-h-0 flex-col">
                                <CardHeader className="pb-3">
                                    <CardTitle>Upload health</CardTitle>
                                    <CardDescription>
                                        In-progress and stale uploads.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="grid grid-cols-2 gap-3">
                                    <div>
                                        <div className="text-muted-foreground text-xs">
                                            In progress
                                        </div>
                                        <div className="text-2xl font-semibold">
                                            {uploadHealth.in_progress_count.toLocaleString()}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-muted-foreground text-xs">
                                            Stale
                                        </div>
                                        <div
                                            className={
                                                uploadHealth.stale_count > 0
                                                    ? 'text-2xl font-semibold text-destructive'
                                                    : 'text-2xl font-semibold'
                                            }
                                        >
                                            {uploadHealth.stale_count.toLocaleString()}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        <div className="grid min-h-0 grid-cols-1 gap-4 lg:grid-cols-2">
                            <Card className="flex min-h-0 flex-1 flex-col">
                                <CardHeader className="pb-3">
                                    <CardTitle>Largest files</CardTitle>
                                    <CardDescription>
                                        Top 10 by size (loaded after initial
                                        render).
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="flex min-h-0 flex-1 flex-col">
                                    <Deferred
                                        data="largestFiles"
                                        fallback={
                                            <div className="text-muted-foreground text-sm">
                                                Loading…
                                            </div>
                                        }
                                    >
                                        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border">
                                            <div className="min-h-0 flex-1 overflow-auto">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>
                                                                File
                                                            </TableHead>
                                                            <TableHead className="w-[7rem] text-right">
                                                                Size
                                                            </TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {(largestFiles ?? []).map(
                                                            (file) => (
                                                                <TableRow
                                                                    key={
                                                                        file.id
                                                                    }
                                                                >
                                                                    <TableCell className="min-w-0">
                                                                        <div className="truncate font-medium">
                                                                            {
                                                                                file.name
                                                                            }
                                                                        </div>
                                                                        <div className="text-muted-foreground truncate text-xs">
                                                                            {
                                                                                file.disk
                                                                            }{' '}
                                                                            ·{' '}
                                                                            {
                                                                                file.path
                                                                            }
                                                                        </div>
                                                                    </TableCell>
                                                                    <TableCell className="text-right">
                                                                        {formatBytes(
                                                                            file.size,
                                                                        )}
                                                                    </TableCell>
                                                                </TableRow>
                                                            ),
                                                        )}
                                                        {(largestFiles ?? [])
                                                            .length === 0 ? (
                                                            <TableRow>
                                                                <TableCell
                                                                    className="text-muted-foreground py-6 text-center"
                                                                    colSpan={2}
                                                                >
                                                                    No files yet.
                                                                </TableCell>
                                                            </TableRow>
                                                        ) : null}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        </div>
                                    </Deferred>
                                </CardContent>
                            </Card>

                            <Card className="flex min-h-0 flex-1 flex-col">
                                <CardHeader className="pb-3">
                                    <CardTitle>Storage trend</CardTitle>
                                    <CardDescription>
                                        Daily bytes added (last 14 days, loaded
                                        after initial render).
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="flex min-h-0 flex-1 flex-col">
                                    <Deferred
                                        data="storageTrend"
                                        fallback={
                                            <div className="text-muted-foreground text-sm">
                                                Loading…
                                            </div>
                                        }
                                    >
                                        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border">
                                            <div className="min-h-0 flex-1 overflow-auto">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>
                                                                Date
                                                            </TableHead>
                                                            <TableHead className="w-[8rem] text-right">
                                                                Added
                                                            </TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {storageTrendRows.map(
                                                            (row) => (
                                                                <TableRow
                                                                    key={
                                                                        row.date
                                                                    }
                                                                >
                                                                    <TableCell className="font-medium">
                                                                        {
                                                                            row.date
                                                                        }
                                                                    </TableCell>
                                                                    <TableCell className="text-right">
                                                                        {formatBytes(
                                                                            row.bytes_added,
                                                                        )}
                                                                    </TableCell>
                                                                </TableRow>
                                                            ),
                                                        )}
                                                        {storageTrendRows.length ===
                                                        0 ? (
                                                            <TableRow>
                                                                <TableCell
                                                                    className="text-muted-foreground py-6 text-center"
                                                                    colSpan={2}
                                                                >
                                                                    No data.
                                                                </TableCell>
                                                            </TableRow>
                                                        ) : null}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        </div>
                                    </Deferred>
                                </CardContent>
                            </Card>
                        </div>

                        <div className="min-h-0 lg:flex lg:flex-1 lg:flex-col">
                            <Card className="flex min-h-0 flex-col lg:flex-1">
                                <CardHeader className="pb-3">
                                    <CardTitle>Storage by disk</CardTitle>
                                    <CardDescription>
                                        Optional breakdown (top 8, loaded after initial render).
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="flex min-h-0 flex-1 flex-col">
                                    <Deferred
                                        data="fileStatsByDisk"
                                        fallback={
                                            <div className="text-muted-foreground text-sm">
                                                Loading…
                                            </div>
                                        }
                                    >
                                        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border">
                                            <div className="min-h-0 flex-1 overflow-auto">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>Disk</TableHead>
                                                            <TableHead className="text-right">
                                                                Files
                                                            </TableHead>
                                                            <TableHead className="text-right">
                                                                Size
                                                            </TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {fileStatsByDiskRows.map(
                                                            (row) => (
                                                                <TableRow
                                                                    key={row.disk}
                                                                >
                                                                    <TableCell className="font-medium">
                                                                        {row.disk}
                                                                    </TableCell>
                                                                    <TableCell className="text-right">
                                                                        {row.files_count.toLocaleString()}
                                                                    </TableCell>
                                                                    <TableCell className="text-right">
                                                                        {formatBytes(
                                                                            row.files_size_sum,
                                                                        )}
                                                                    </TableCell>
                                                                </TableRow>
                                                            ),
                                                        )}
                                                        {fileStatsByDiskRows.length ===
                                                        0 ? (
                                                            <TableRow>
                                                                <TableCell
                                                                    className="text-muted-foreground py-6 text-center"
                                                                    colSpan={3}
                                                                >
                                                                    No data.
                                                                </TableCell>
                                                            </TableRow>
                                                        ) : null}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        </div>
                                    </Deferred>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </div>
            </PageLayout>
        </AppLayout>
    );
}
