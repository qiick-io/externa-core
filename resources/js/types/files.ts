export type AdminFileRow = {
    id: number;
    uuid: string;
    parent_id: number | null;
    type: 'file' | 'folder';
    name: string;
    path: string;
    disk: string;
    storage_path: string | null;
    mime_type: string | null;
    extension: string | null;
    size: number | null;
    width: number | null;
    height: number | null;
    meta: Record<string, unknown> | null;
    hash: string | null;
    created_at: string;
    updated_at: string;
    deleted_at?: string | null;
};

export type FileBreadcrumb = {
    id: number;
    name: string;
};

export type FileUploadProgress = {
    uploadId: string;
    fileName: string;
    totalChunks: number;
    uploadedChunks: number;
    status: 'pending' | 'uploading' | 'complete' | 'error';
    error?: string;
};
