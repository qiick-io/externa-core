import type { LucideIcon } from 'lucide-react';

export type FileTag = {
    id: number;
    name: string;
    slug: string;
};

/** File manager row for files and folders in admin UI and API responses. */
export type AdminFileRow = {
    id: number;
    uuid: string;
    parent_id: number | null;
    type: 'file' | 'folder';
    name: string;
    title: string | null;
    description: string | null;
    location: string | null;
    download_name: string | null;
    path: string;
    disk: string;
    storage_path: string | null;
    url?: string | null;
    thumbnail_url?: string | null;
    mime_type: string | null;
    extension: string | null;
    size: number | null;
    width: number | null;
    height: number | null;
    meta: Record<string, unknown> | null;
    hash: string | null;
    focal_point_x: number | null;
    focal_point_y: number | null;
    translate_x: number | null;
    translate_y: number | null;
    scale: number | null;
    is_favorited: boolean;
    tags: FileTag[];
    created_at: string;
    updated_at: string;
    deleted_at?: string | null;
};

export type FilesPaginator = {
    data: AdminFileRow[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
};

/** Single segment in the file manager folder breadcrumb trail. */
export type FileBreadcrumb = {
    id: number;
    name: string;
};

/** In-memory upload progress tracked by {@link file-upload-store}. */
export type FileUploadProgress = {
    uploadId: string;
    fileName: string;
    kind?: 'file' | 'batch';
    totalChunks: number;
    uploadedChunks: number;
    totalFiles?: number;
    uploadedFiles?: number;
    totalBytes?: number;
    uploadedBytes?: number;
    status: 'pending' | 'uploading' | 'complete' | 'error';
    error?: string;
};

export type FileActionKey =
    | 'details'
    | 'download'
    | 'move'
    | 'rename'
    | 'duplicate'
    | 'favorite'
    | 'unfavorite'
    | 'replace'
    | 'tag'
    | 'delete'
    | 'restore'
    | 'force_delete';

/** Context menu / overflow action definition for file rows. */
export type FileActionDefinition = {
    key: FileActionKey;
    label: string;
    icon: LucideIcon;
    destructive?: boolean;
};
