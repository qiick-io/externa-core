/** Normalized Laravel paginator shape used across admin list views. */
export type Paginated<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    links?: { url: string | null; label: string; active: boolean }[];
};

/** Permission names grouped by admin section for the permissions matrix UI. */
export type PermissionGroup = {
    section: string;
    label: string;
    show_permission: { id: number; name: string } | null;
    child_permissions: { id: number; name: string }[];
};

/** Generic id/label pair for admin select components. */
export type AdminSelectOption = {
    id: number;
    label: string;
};

export type AdminRoleRef = {
    id: number;
    name: string;
};

export type AdminGroupRef = {
    id: number;
    name: string;
    slug?: string;
};

export type AdminUserRow = {
    id: number;
    first_name: string;
    last_name: string | null;
    email: string;
    username?: string | null;
    is_active: boolean;
    email_verified_at: string | null;
    deleted_at: string | null;
    roles: AdminRoleRef[];
    groups: AdminGroupRef[];
    created_at: string;
    updated_at: string;
};

export type AdminGroupRow = {
    id: number;
    name: string;
    slug: string;
    description: string | null;
    deleted_at: string | null;
    users_count?: number;
    roles: AdminRoleRef[];
    created_at: string;
    updated_at: string;
};

export type AdminRoleRow = {
    id: number;
    name: string;
    is_system?: boolean;
    is_assignable?: boolean;
    permissions_count?: number;
    created_at: string;
    updated_at: string;
};

export type AdminPermissionRow = {
    id: number;
    name: string;
    guard_name: string;
    created_at: string;
    updated_at: string;
};

export type AdminActivityLogCauser = {
    id: number;
    name: string;
    email: string;
};

export type AdminActivityLogSubject = {
    type: string;
    id: number;
    label: string;
};

export type AdminActivityLogRow = {
    id: number;
    event: string | null;
    description: string;
    log_name: string | null;
    created_at: string;
    causer: AdminActivityLogCauser | null;
    subject: AdminActivityLogSubject | null;
    changes: Record<string, unknown>;
    properties: {
        ip: string | null;
        user_agent: string | null;
    };
};
