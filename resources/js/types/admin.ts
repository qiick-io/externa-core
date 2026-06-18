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

export type PermissionGroup = {
    section: string;
    label: string;
    show_permission: { id: number; name: string } | null;
    child_permissions: { id: number; name: string }[];
};

export type Paginated<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    links?: { url: string | null; label: string; active: boolean }[];
};

export type AdminSelectOption = {
    id: number;
    label: string;
};
