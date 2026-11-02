/**
 * Collection item row as returned for list / kanban / calendar layouts.
 */
export type ItemRow = {
    id: number;
    collection_id?: number;
    data: Record<string, unknown>;
    created_at?: string | null;
    updated_at?: string | null;
    user_created?: { id: number; name: string; email?: string | null } | null;
    user_updated?: { id: number; name: string; email?: string | null } | null;
    displays?: Record<string, string | null>;
    thumbs?: Record<string, string | null>;
    has_draft?: boolean;
    schedule_failed?: boolean;
    approval_status?: string | null;
};
