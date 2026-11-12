/**
 * Prop shapes of the dashboard page, as `DashboardOverviewMetricsService` builds them.
 * Shared by the page and its overview / health sections.
 */
export type LatestActivityItem = {
    id: number;
    log_name: string | null;
    event: string | null;
    description: string;
    created_at: string | null;
    causer: { id: number; label: string } | null;
    subject: { type: string | null; id: number; label: string } | null;
};

export type MostActiveUser = {
    id: number;
    label: string;
    activity_count: number;
};

export type SuspiciousEventItem = {
    id: number;
    log_name: string | null;
    event: string | null;
    description: string;
    created_at: string | null;
    causer: { id: number; label: string } | null;
};

export type StuckOrphanUploadItem = {
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

export type LargestFileItem = {
    id: number;
    name: string;
    path: string;
    disk: string;
    size: number;
    created_at: string | null;
};

export type StorageTrendItem = {
    date: string;
    bytes_added: number;
};

export type CollectionCountItem = {
    id: number;
    name: string;
    slug: string;
    items_count: number;
};

export type ActivityOverTimeItem = {
    date: string;
    count: number;
};

export type ContentEventBreakdown = {
    created: number;
    updated: number;
    deleted: number;
};

type HorizonWorkload = {
    name: string;
    length: number;
    wait: number;
    processes: number;
};

type HorizonMetrics = {
    available: boolean;
    status: string;
    masters: number;
    processes: number;
    pending: number;
    failed: number;
    jobs_per_minute: number | null;
    throughput: number | null;
    workloads: HorizonWorkload[];
};

export type HealthMetrics = {
    queue_connection: string;
    broadcast_connection: string;
    pulse_enabled: boolean;
    pulse_ingest: string;
    pulse_available: boolean;
    redis_ok: boolean;
    failed_jobs: number;
    pending_jobs: number;
    exceptions_24h: number;
    slow_jobs_24h: number;
    slow_queries_24h: number;
    horizon: HorizonMetrics;
};

export type DiskFileStatsItem = {
    disk: string;
    files_count: number;
    files_size_sum: number;
};

/** The Overview tab's props; `largestFiles`, `fileStatsByDisk` and `storageTrend` are deferred. */
export type DashboardOverviewMetrics = {
    latestActivity: LatestActivityItem[];
    fileStats: {
        files_count: number;
        folders_count: number;
        files_size_sum: number;
    };
    uploadHealth: { in_progress_count: number; stale_count: number };
    mostActiveUsers: MostActiveUser[];
    suspiciousEvents: SuspiciousEventItem[];
    stuckOrphanUploads: StuckOrphanUploadItem[];
    largestFiles?: LargestFileItem[];
    fileStatsByDisk?: DiskFileStatsItem[];
    storageTrend?: StorageTrendItem[];
    collectionCounts?: CollectionCountItem[];
    activityOverTime?: ActivityOverTimeItem[];
    contentEventBreakdown?: ContentEventBreakdown;
};

export type DashboardView = 'overview' | 'health';
