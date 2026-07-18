import { FileIcon, FolderOpen } from 'lucide-react';
import { Link } from '@inertiajs/react';
import adminRoutes from '@/lib/admin-routes';
import { filePublicUrl, isImageFile } from '@/lib/files-api';
import type { AdminFileRow } from '@/types/files';

export type AiFileCardItem = {
    id: number;
    parent_id?: number | null;
    type: 'file' | 'folder' | string;
    name: string;
    path?: string | null;
    storage_path?: string | null;
    mime_type?: string | null;
    size?: number | null;
};

type Props = {
    files: AiFileCardItem[];
};

function toAdminFileRow(file: AiFileCardItem): AdminFileRow {
    return {
        id: file.id,
        uuid: '',
        parent_id: file.parent_id ?? null,
        type: file.type === 'folder' ? 'folder' : 'file',
        name: file.name,
        title: null,
        description: null,
        location: null,
        download_name: null,
        path: file.path ?? file.name,
        disk: 'public',
        storage_path: file.storage_path ?? null,
        mime_type: file.mime_type ?? null,
        extension: null,
        size: file.size ?? null,
        width: null,
        height: null,
        meta: null,
        hash: null,
        focal_point_x: null,
        focal_point_y: null,
        translate_x: null,
        translate_y: null,
        scale: null,
        is_favorited: false,
        tags: [],
        created_at: '',
        updated_at: '',
    };
}

export function AiFileCards({ files }: Props) {
    if (files.length === 0) {
        return null;
    }

    return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {files.map((file) => {
                const row = toAdminFileRow(file);
                const isFolder = file.type === 'folder';
                const publicUrl = filePublicUrl(row);
                const folderId = isFolder
                    ? file.id
                    : (file.parent_id ?? null);
                const href =
                    folderId != null
                        ? adminRoutes.files.index(folderId)
                        : adminRoutes.files.index();

                return (
                    <Link
                        key={file.id}
                        href={href}
                        className="group flex flex-col items-center gap-2 rounded-xl border border-sidebar-border/70 bg-card p-3 transition-colors hover:bg-muted/40"
                    >
                        {isFolder ? (
                            <FolderOpen className="size-10 text-amber-500" />
                        ) : publicUrl && isImageFile(row) ? (
                            <img
                                src={publicUrl}
                                alt={file.name}
                                className="size-10 rounded object-cover"
                            />
                        ) : (
                            <FileIcon className="size-10 text-muted-foreground" />
                        )}
                        <span className="w-full truncate text-center text-xs font-medium">
                            {file.name}
                        </span>
                    </Link>
                );
            })}
        </div>
    );
}

export function fileCardsFromToolResults(
    toolResults: unknown,
): AiFileCardItem[] {
    if (!Array.isArray(toolResults)) {
        return [];
    }

    const byId = new Map<number, AiFileCardItem>();

    for (const entry of toolResults) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }

        const record = entry as Record<string, unknown>;
        const toolName =
            typeof record.name === 'string'
                ? record.name
                : typeof record.tool_name === 'string'
                  ? record.tool_name
                  : 'ManageFiles';
        const cards = fileCardsFromToolResult(toolName, record.result);

        for (const file of cards) {
            byId.set(file.id, file);
        }
    }

    return [...byId.values()];
}

export function fileCardsFromToolResult(
    toolName: string,
    result: unknown,
): AiFileCardItem[] {
    const normalizedName = toolName.replace(/\\/g, '/').split('/').pop() ?? '';

    if (!/ManageFiles/i.test(normalizedName)) {
        return [];
    }

    let payload: unknown = result;

    if (typeof result === 'string') {
        const trimmed = result.trim();

        if (trimmed === '' || trimmed.startsWith('Error:')) {
            return [];
        }

        try {
            payload = JSON.parse(trimmed);
        } catch {
            return [];
        }
    }

    if (!payload || typeof payload !== 'object') {
        return [];
    }

    const record = payload as Record<string, unknown>;
    const collected: AiFileCardItem[] = [];

    const pushFile = (value: unknown) => {
        if (!value || typeof value !== 'object') {
            return;
        }

        const file = value as Record<string, unknown>;
        const id = Number(file.id);
        const name = typeof file.name === 'string' ? file.name : '';

        if (!Number.isFinite(id) || id <= 0 || name === '') {
            return;
        }

        collected.push({
            id,
            parent_id:
                file.parent_id === null || file.parent_id === undefined
                    ? null
                    : Number(file.parent_id),
            type: typeof file.type === 'string' ? file.type : 'file',
            name,
            path: typeof file.path === 'string' ? file.path : null,
            storage_path:
                typeof file.storage_path === 'string'
                    ? file.storage_path
                    : null,
            mime_type:
                typeof file.mime_type === 'string' ? file.mime_type : null,
            size:
                typeof file.size === 'number'
                    ? file.size
                    : file.size === null
                      ? null
                      : Number(file.size) || null,
        });
    };

    if (Array.isArray(record.files)) {
        for (const entry of record.files) {
            pushFile(entry);
        }
    }

    if (Array.isArray(record.moved)) {
        for (const entry of record.moved) {
            pushFile(entry);
        }
    }

    pushFile(record.file);

    const byId = new Map<number, AiFileCardItem>();

    for (const file of collected) {
        byId.set(file.id, file);
    }

    return [...byId.values()];
}
