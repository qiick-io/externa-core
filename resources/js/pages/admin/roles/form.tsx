import { Head, Link, useForm } from '@inertiajs/react';
import { Check, Search, X } from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UnsavedChangesToolbar } from '@/components/unsaved-changes-toolbar';
import { useRegisterUnsavedChanges } from '@/hooks/use-unsaved-changes';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import adminRoutes from '@/lib/admin-routes';
import { cn } from '@/lib/utils';
import { edit as editProfile } from '@/routes/profile';
import type { AdminRoleRow, BreadcrumbItem, PermissionGroup } from '@/types';

type RoleFormRole = AdminRoleRow & {
    permissions?: { id: number; name: string }[];
    is_system?: boolean;
    is_assignable?: boolean;
};

type CollectionFieldOption = { name: string; type: string };

type CollectionRow = {
    id: number;
    name: string;
    slug: string;
    fields?: CollectionFieldOption[];
};

type FieldFlags = { read: boolean; create: boolean; update: boolean };

type ItemFilterRule = {
    field: string;
    operator: 'equals' | 'not_equals' | 'empty' | 'not_empty';
    value?: string;
};

type PermissionRules = {
    fields: Record<string, FieldFlags>;
    item_filter: { logic: 'and'; rules: ItemFilterRule[] } | null;
};

type CollectionActions = {
    create: boolean;
    read: boolean;
    update: boolean;
    delete: boolean;
    rules?: PermissionRules;
};

type FileActions = {
    create: boolean;
    read: boolean;
    read_private: boolean;
    update: boolean;
    delete: boolean;
};

const emptyRules = (): PermissionRules => ({
    fields: {},
    item_filter: null,
});

const defaultFieldFlags = (): FieldFlags => ({
    read: true,
    create: true,
    update: true,
});

const FILE_ACTIONS = [
    { key: 'create' as const, label: 'Create' },
    { key: 'read' as const, label: 'Read' },
    { key: 'read_private' as const, label: 'Read private' },
    { key: 'update' as const, label: 'Update' },
    { key: 'delete' as const, label: 'Delete' },
];

const COLLECTION_ACTIONS = [
    { key: 'create' as const, label: 'Create' },
    { key: 'read' as const, label: 'Read' },
    { key: 'update' as const, label: 'Update' },
    { key: 'delete' as const, label: 'Delete' },
];

const FIELD_ACTIONS = [
    { key: 'read' as const, label: 'Read' },
    { key: 'create' as const, label: 'Create' },
    { key: 'update' as const, label: 'Update' },
];

/**
 * Create or edit role with admin permissions and collection API access matrix.
 */
export default function AdminRoleForm({
    role: roleProp,
    permissionGroups,
    collections = [],
    collectionPermissions = {},
    filePermissions = {
        create: false,
        read: false,
        read_private: false,
        update: false,
        delete: false,
    },
}: {
    role?: RoleFormRole | { data: RoleFormRole } | null;
    permissionGroups: PermissionGroup[];
    collections?: CollectionRow[];
    collectionPermissions?: Record<string, CollectionActions>;
    filePermissions?: FileActions;
}) {
    // Tolerate accidental JsonResource wrapping ({ data: role })
    const role: RoleFormRole | null | undefined =
        roleProp && typeof roleProp === 'object' && 'data' in roleProp
            ? (roleProp as { data: RoleFormRole }).data
            : (roleProp as RoleFormRole | null | undefined);

    const { t } = useTranslation();
    const isEdit = Boolean(role?.id);
    const isSystem = Boolean(role?.is_system);
    const isPublic = role?.name === 'public';

    const emptyMatrix = (): Record<string, CollectionActions> => {
        const matrix: Record<string, CollectionActions> = {};

        for (const collection of collections) {
            const existing = collectionPermissions[String(collection.id)];
            matrix[String(collection.id)] = {
                create: existing?.create ?? false,
                read: existing?.read ?? false,
                update: existing?.update ?? false,
                delete: existing?.delete ?? false,
                rules: existing?.rules ?? emptyRules(),
            };
        }

        return matrix;
    };

    const form = useForm({
        name: role?.name ?? '',
        permission_ids: [] as number[],
        collection_permissions: emptyMatrix(),
        file_permissions: {
            create: filePermissions.create ?? false,
            read: filePermissions.read ?? false,
            read_private: filePermissions.read_private ?? false,
            update: filePermissions.update ?? false,
            delete: filePermissions.delete ?? false,
        } as FileActions,
    });

    useRegisterUnsavedChanges({
        scope: 'page',
        isDirty: form.isDirty,
        onDiscard: () => {
            form.reset();
            form.clearErrors();
        },
    });

    useEffect(() => {
        const permissionIds = role?.permissions?.length
            ? role.permissions.map((p) => p.id)
            : [];
        const collection_permissions = emptyMatrix();
        const file_permissions = {
            create: filePermissions.create ?? false,
            read: filePermissions.read ?? false,
            read_private: filePermissions.read_private ?? false,
            update: filePermissions.update ?? false,
            delete: filePermissions.delete ?? false,
        };
        // Fresh object for setDefaults — avoid sharing the setData reference.
        const payload = {
            name: role?.name ?? '',
            permission_ids: permissionIds,
            collection_permissions,
            file_permissions,
        };
        form.setData(payload);
        form.setDefaults({
            ...payload,
            permission_ids: [...permissionIds],
            collection_permissions: { ...collection_permissions },
            file_permissions: { ...file_permissions },
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [role?.id, collections.length]);

    const breadcrumbs: BreadcrumbItem[] = useMemo(
        () => [
            {
                title: t('settings.layout.title'),
                href: editProfile(),
            },
            {
                title: t('settings.layout.roles'),
                href: adminRoutes.roles.index(),
            },
            {
                title: isEdit ? 'Edit role' : 'New role',
                href: isEdit
                    ? adminRoutes.roles.edit(role!.id)
                    : adminRoutes.roles.create(),
            },
        ],
        [isEdit, role, t],
    );

    const [collectionSearch, setCollectionSearch] = useState('');
    const collectionQuery = collectionSearch.trim().toLowerCase();
    const filteredCollections = collections.filter(
        (c) =>
            !collectionQuery ||
            c.name.toLowerCase().includes(collectionQuery) ||
            c.slug.toLowerCase().includes(collectionQuery),
    );

    const groupPermissionIds = (group: PermissionGroup): number[] => {
        const ids: number[] = [];

        if (group.show_permission) {
            ids.push(group.show_permission.id);
        }

        for (const child of group.child_permissions) {
            ids.push(child.id);
        }

        return ids;
    };

    const togglePermission = (id: number, checked: boolean): void => {
        const current = form.data.permission_ids;
        form.setData(
            'permission_ids',
            checked ? [...current, id] : current.filter((pid) => pid !== id),
        );
    };

    const toggleGroup = (group: PermissionGroup, checked: boolean): void => {
        const ids = groupPermissionIds(group);
        const current = new Set(form.data.permission_ids);

        if (checked) {
            ids.forEach((id) => current.add(id));
        } else {
            ids.forEach((id) => current.delete(id));
        }

        form.setData('permission_ids', [...current]);
    };

    const toggleCollectionAction = (
        collectionId: number,
        action: 'create' | 'read' | 'update' | 'delete',
        checked: boolean,
    ): void => {
        const key = String(collectionId);
        form.setData('collection_permissions', {
            ...form.data.collection_permissions,
            [key]: {
                ...form.data.collection_permissions[key],
                [action]: checked,
            },
        });
    };

    const setFieldFlag = (
        collectionId: number,
        fieldName: string,
        flag: keyof FieldFlags,
        checked: boolean,
    ): void => {
        const key = String(collectionId);
        const current = form.data.collection_permissions[key];
        const rules = current?.rules ?? emptyRules();
        const fields = { ...rules.fields };
        fields[fieldName] = {
            ...(fields[fieldName] ?? defaultFieldFlags()),
            [flag]: checked,
        };
        form.setData('collection_permissions', {
            ...form.data.collection_permissions,
            [key]: { ...current, rules: { ...rules, fields } },
        });
    };

    const setItemFilterRules = (
        collectionId: number,
        filterRules: ItemFilterRule[],
    ): void => {
        const key = String(collectionId);
        const current = form.data.collection_permissions[key];
        const rules = current?.rules ?? emptyRules();
        form.setData('collection_permissions', {
            ...form.data.collection_permissions,
            [key]: {
                ...current,
                rules: {
                    ...rules,
                    item_filter:
                        filterRules.length === 0
                            ? null
                            : { logic: 'and', rules: filterRules },
                },
            },
        });
    };

    const toggleFileAction = (
        action: keyof FileActions,
        checked: boolean,
    ): void => {
        form.setData('file_permissions', {
            ...form.data.file_permissions,
            [action]: checked,
        });
    };

    const submit = (): void => {
        const opts = { preserveScroll: true };

        if (isEdit) {
            form.put(adminRoutes.roles.update(role!.id), opts);
        } else {
            form.post(adminRoutes.roles.store(), opts);
        }
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={isEdit ? `Edit ${role?.name}` : 'New role'} />

            <SettingsLayout wide>
                <div className="flex min-h-0 flex-1 flex-col gap-6">
                    <form
                        className="flex w-full flex-col gap-6"
                        onSubmit={(e) => {
                            e.preventDefault();
                            submit();
                        }}
                    >
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <div>
                                <h1 className="text-xl font-semibold tracking-tight">
                                    {isEdit ? 'Edit role' : 'New role'}
                                </h1>
                                {isSystem && (
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        System role — name is locked; not
                                        assignable to users.
                                    </p>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <UnsavedChangesToolbar
                                    isDirty={form.isDirty}
                                    className="flex items-center gap-2"
                                />
                                <Button variant="outline" asChild>
                                    <Link href={adminRoutes.roles.index()}>
                                        Cancel
                                    </Link>
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={form.processing}
                                >
                                    {isEdit ? 'Save' : 'Create'}
                                </Button>
                            </div>
                        </div>

                        <div className="grid max-w-md gap-2">
                            <Label htmlFor="role_name">Name</Label>
                            <Input
                                id="role_name"
                                value={form.data.name}
                                onChange={(e) =>
                                    form.setData('name', e.target.value)
                                }
                                required
                                disabled={isSystem}
                            />
                            <InputError message={form.errors.name} />
                        </div>

                        {!isPublic && (
                            <div className="space-y-6">
                                <h2 className="text-lg font-medium">
                                    Admin permissions
                                </h2>
                                {permissionGroups.map((group) => {
                                    const ids = groupPermissionIds(group);
                                    const allChecked =
                                        ids.length > 0 &&
                                        ids.every((id) =>
                                            form.data.permission_ids.includes(
                                                id,
                                            ),
                                        );

                                    return (
                                        <section
                                            key={group.section}
                                            className="rounded-xl border border-sidebar-border/70 p-4 dark:border-sidebar-border"
                                        >
                                            <div className="mb-3 flex items-center gap-2">
                                                <Checkbox
                                                    id={`section-${group.section}`}
                                                    checked={allChecked}
                                                    onCheckedChange={(c) =>
                                                        toggleGroup(
                                                            group,
                                                            c === true,
                                                        )
                                                    }
                                                />
                                                <Label
                                                    htmlFor={`section-${group.section}`}
                                                    className="text-base font-semibold"
                                                >
                                                    {group.label}
                                                </Label>
                                            </div>
                                            <div className="grid gap-2 sm:grid-cols-2">
                                                {group.show_permission && (
                                                    <label className="flex items-center gap-2 text-sm font-medium">
                                                        <Checkbox
                                                            checked={form.data.permission_ids.includes(
                                                                group
                                                                    .show_permission
                                                                    .id,
                                                            )}
                                                            onCheckedChange={(
                                                                c,
                                                            ) =>
                                                                togglePermission(
                                                                    group
                                                                        .show_permission!
                                                                        .id,
                                                                    c === true,
                                                                )
                                                            }
                                                        />
                                                        <span>
                                                            {
                                                                group
                                                                    .show_permission
                                                                    .name
                                                            }
                                                        </span>
                                                    </label>
                                                )}
                                                {group.child_permissions.map(
                                                    (perm) => (
                                                        <label
                                                            key={perm.id}
                                                            className="flex items-center gap-2 text-sm"
                                                        >
                                                            <Checkbox
                                                                checked={form.data.permission_ids.includes(
                                                                    perm.id,
                                                                )}
                                                                onCheckedChange={(
                                                                    c,
                                                                ) =>
                                                                    togglePermission(
                                                                        perm.id,
                                                                        c ===
                                                                            true,
                                                                    )
                                                                }
                                                            />
                                                            <span>
                                                                {perm.name}
                                                            </span>
                                                        </label>
                                                    ),
                                                )}
                                            </div>
                                        </section>
                                    );
                                })}
                            </div>
                        )}

                        <section className="space-y-3">
                            <div>
                                <h2 className="text-lg font-medium">
                                    Files access
                                </h2>
                                <p className="text-sm text-muted-foreground">
                                    Public CMS API file permissions.{' '}
                                    <strong>Read</strong> covers public files;{' '}
                                    <strong>Read private</strong> is required
                                    for files/folders marked private (and their
                                    inherited children). Missing grant = deny.
                                </p>
                            </div>

                            <div className="overflow-x-auto rounded-xl border border-sidebar-border/70 dark:border-sidebar-border">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-muted/40">
                                            <th className="px-3 py-2 text-left font-medium">
                                                Resource
                                            </th>
                                            {FILE_ACTIONS.map((action) => (
                                                <th
                                                    key={action.key}
                                                    className="px-2 py-2 text-center font-medium"
                                                >
                                                    {action.label}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr className="border-b last:border-0">
                                            <td className="px-3 py-2">
                                                <div className="font-medium">
                                                    Files
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    /api/v1/files
                                                </div>
                                            </td>
                                            {FILE_ACTIONS.map((action) => {
                                                const allowed =
                                                    form.data.file_permissions[
                                                        action.key
                                                    ];

                                                return (
                                                    <td
                                                        key={action.key}
                                                        className="px-2 py-2 text-center"
                                                    >
                                                        <button
                                                            type="button"
                                                            aria-pressed={
                                                                allowed
                                                            }
                                                            aria-label={`${action.label} for files: ${allowed ? 'allowed' : 'denied'}`}
                                                            title={`${action.label}: ${allowed ? 'Allowed' : 'Denied'}`}
                                                            className={cn(
                                                                'inline-flex size-8 items-center justify-center rounded-md border transition-colors',
                                                                allowed
                                                                    ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                                                    : 'border-destructive/50 bg-destructive/10 text-destructive',
                                                            )}
                                                            onClick={() =>
                                                                toggleFileAction(
                                                                    action.key,
                                                                    !allowed,
                                                                )
                                                            }
                                                        >
                                                            {allowed ? (
                                                                <Check
                                                                    className="size-4"
                                                                    strokeWidth={
                                                                        2.5
                                                                    }
                                                                    aria-hidden
                                                                />
                                                            ) : (
                                                                <X
                                                                    className="size-4"
                                                                    strokeWidth={
                                                                        2.5
                                                                    }
                                                                    aria-hidden
                                                                />
                                                            )}
                                                        </button>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            <InputError
                                message={form.errors.file_permissions}
                            />
                        </section>

                        <section className="space-y-3">
                            <div className="flex flex-wrap items-end justify-between gap-4">
                                <div>
                                    <h2 className="text-lg font-medium">
                                        Collection access
                                    </h2>
                                    <p className="text-sm text-muted-foreground">
                                        Public CMS API permissions (create /
                                        read / update / delete). Missing grant =
                                        deny.
                                    </p>
                                </div>
                                {collections.length > 0 ? (
                                    <div className="relative w-full max-w-xs sm:w-56">
                                        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                                        <Input
                                            value={collectionSearch}
                                            onChange={(e) =>
                                                setCollectionSearch(
                                                    e.target.value,
                                                )
                                            }
                                            placeholder="Search collections…"
                                            className="pl-9"
                                            aria-label="Search collections"
                                        />
                                    </div>
                                ) : null}
                            </div>

                            {collections.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    No collections yet.
                                </p>
                            ) : filteredCollections.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    No collections match.
                                </p>
                            ) : (
                                <div className="overflow-x-auto rounded-xl border border-sidebar-border/70 dark:border-sidebar-border">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b bg-muted/40">
                                                <th className="px-3 py-2 text-left font-medium">
                                                    Collection
                                                </th>
                                                {COLLECTION_ACTIONS.map(
                                                    (action) => (
                                                        <th
                                                            key={action.key}
                                                            className="px-2 py-2 text-center font-medium"
                                                        >
                                                            {action.label}
                                                        </th>
                                                    ),
                                                )}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredCollections.map(
                                                (collection) => {
                                                const key = String(
                                                    collection.id,
                                                );
                                                const row = form.data
                                                    .collection_permissions[
                                                    key
                                                ] ?? {
                                                    create: false,
                                                    read: false,
                                                    update: false,
                                                    delete: false,
                                                    rules: emptyRules(),
                                                };
                                                const anyGrant =
                                                    row.create ||
                                                    row.read ||
                                                    row.update ||
                                                    row.delete;
                                                const rules =
                                                    row.rules ?? emptyRules();
                                                const filterRules =
                                                    rules.item_filter?.rules ??
                                                    [];
                                                const fieldOptions =
                                                    collection.fields ?? [];

                                                return (
                                                    <Fragment
                                                        key={collection.id}
                                                    >
                                                        <tr className="border-b last:border-0">
                                                            <td className="px-3 py-2">
                                                                <div className="font-medium">
                                                                    {
                                                                        collection.name
                                                                    }
                                                                </div>
                                                                <div className="text-xs text-muted-foreground">
                                                                    {
                                                                        collection.slug
                                                                    }
                                                                </div>
                                                            </td>
                                                            {COLLECTION_ACTIONS.map(
                                                                (action) => {
                                                                    const allowed =
                                                                        row[
                                                                            action
                                                                                .key
                                                                        ];

                                                                    return (
                                                                        <td
                                                                            key={
                                                                                action.key
                                                                            }
                                                                            className="px-2 py-2 text-center"
                                                                        >
                                                                            <button
                                                                                type="button"
                                                                                aria-pressed={
                                                                                    allowed
                                                                                }
                                                                                aria-label={`${action.label} for ${collection.name}: ${allowed ? 'allowed' : 'denied'}`}
                                                                                title={`${action.label}: ${allowed ? 'Allowed' : 'Denied'}`}
                                                                                className={cn(
                                                                                    'inline-flex size-8 items-center justify-center rounded-md border transition-colors',
                                                                                    allowed
                                                                                        ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                                                                        : 'border-destructive/50 bg-destructive/10 text-destructive',
                                                                                )}
                                                                                onClick={() =>
                                                                                    toggleCollectionAction(
                                                                                        collection.id,
                                                                                        action.key,
                                                                                        !allowed,
                                                                                    )
                                                                                }
                                                                            >
                                                                                {allowed ? (
                                                                                    <Check
                                                                                        className="size-4"
                                                                                        strokeWidth={
                                                                                            2.5
                                                                                        }
                                                                                        aria-hidden
                                                                                    />
                                                                                ) : (
                                                                                    <X
                                                                                        className="size-4"
                                                                                        strokeWidth={
                                                                                            2.5
                                                                                        }
                                                                                        aria-hidden
                                                                                    />
                                                                                )}
                                                                            </button>
                                                                        </td>
                                                                    );
                                                                },
                                                            )}
                                                        </tr>
                                                        {anyGrant &&
                                                        fieldOptions.length >
                                                            0 ? (
                                                            <tr
                                                                key={`${collection.id}-rules`}
                                                                className="border-b bg-muted/20 last:border-0"
                                                            >
                                                                <td
                                                                    colSpan={5}
                                                                    className="space-y-3 px-3 py-3"
                                                                >
                                                                    <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                                                        Fields &
                                                                        item
                                                                        filter
                                                                    </div>
                                                                    <div className="grid gap-3 sm:grid-cols-2">
                                                                        {fieldOptions.map(
                                                                            (
                                                                                field,
                                                                            ) => {
                                                                                const flags =
                                                                                    rules
                                                                                        .fields[
                                                                                        field
                                                                                            .name
                                                                                    ] ??
                                                                                    defaultFieldFlags();

                                                                                return (
                                                                                    <div
                                                                                        key={
                                                                                            field.name
                                                                                        }
                                                                                        className="grid grid-cols-[minmax(0,1fr)_4.5rem_5rem_5rem] items-center gap-x-3 rounded-md border border-sidebar-border/60 px-3 py-2.5 text-xs"
                                                                                    >
                                                                                        <span
                                                                                            className="min-w-0 truncate font-medium"
                                                                                            title={
                                                                                                field.name
                                                                                            }
                                                                                        >
                                                                                            {
                                                                                                field.name
                                                                                            }
                                                                                        </span>
                                                                                        {FIELD_ACTIONS.map(
                                                                                            (
                                                                                                action,
                                                                                            ) => (
                                                                                                <label
                                                                                                    key={
                                                                                                        action.key
                                                                                                    }
                                                                                                    className="flex items-center gap-1.5 whitespace-nowrap"
                                                                                                >
                                                                                                    <Checkbox
                                                                                                        checked={
                                                                                                            flags[
                                                                                                                action
                                                                                                                    .key
                                                                                                            ]
                                                                                                        }
                                                                                                        onCheckedChange={(
                                                                                                            c,
                                                                                                        ) =>
                                                                                                            setFieldFlag(
                                                                                                                collection.id,
                                                                                                                field.name,
                                                                                                                action.key,
                                                                                                                c ===
                                                                                                                    true,
                                                                                                            )
                                                                                                        }
                                                                                                    />
                                                                                                    {
                                                                                                        action.label
                                                                                                    }
                                                                                                </label>
                                                                                            ),
                                                                                        )}
                                                                                    </div>
                                                                                );
                                                                            },
                                                                        )}
                                                                    </div>
                                                                    <div className="space-y-2">
                                                                        <div className="text-xs font-medium text-muted-foreground">
                                                                            Item
                                                                            filter
                                                                            (AND)
                                                                        </div>
                                                                        {filterRules.map(
                                                                            (
                                                                                rule,
                                                                                index,
                                                                            ) => (
                                                                                <div
                                                                                    key={
                                                                                        index
                                                                                    }
                                                                                    className="flex flex-wrap items-center gap-2"
                                                                                >
                                                                                    <select
                                                                                        className="h-8 rounded-md border bg-background px-2 text-xs"
                                                                                        value={
                                                                                            rule.field
                                                                                        }
                                                                                        onChange={(
                                                                                            e,
                                                                                        ) => {
                                                                                            const next =
                                                                                                [
                                                                                                    ...filterRules,
                                                                                                ];
                                                                                            next[
                                                                                                index
                                                                                            ] =
                                                                                                {
                                                                                                    ...rule,
                                                                                                    field: e
                                                                                                        .target
                                                                                                        .value,
                                                                                                };
                                                                                            setItemFilterRules(
                                                                                                collection.id,
                                                                                                next,
                                                                                            );
                                                                                        }}
                                                                                    >
                                                                                        {fieldOptions.map(
                                                                                            (
                                                                                                f,
                                                                                            ) => (
                                                                                                <option
                                                                                                    key={
                                                                                                        f.name
                                                                                                    }
                                                                                                    value={
                                                                                                        f.name
                                                                                                    }
                                                                                                >
                                                                                                    {
                                                                                                        f.name
                                                                                                    }
                                                                                                </option>
                                                                                            ),
                                                                                        )}
                                                                                    </select>
                                                                                    <select
                                                                                        className="h-8 rounded-md border bg-background px-2 text-xs"
                                                                                        value={
                                                                                            rule.operator
                                                                                        }
                                                                                        onChange={(
                                                                                            e,
                                                                                        ) => {
                                                                                            const next =
                                                                                                [
                                                                                                    ...filterRules,
                                                                                                ];
                                                                                            next[
                                                                                                index
                                                                                            ] =
                                                                                                {
                                                                                                    ...rule,
                                                                                                    operator:
                                                                                                        e
                                                                                                            .target
                                                                                                            .value as ItemFilterRule['operator'],
                                                                                                };
                                                                                            setItemFilterRules(
                                                                                                collection.id,
                                                                                                next,
                                                                                            );
                                                                                        }}
                                                                                    >
                                                                                        <option value="equals">
                                                                                            equals
                                                                                        </option>
                                                                                        <option value="not_equals">
                                                                                            not_equals
                                                                                        </option>
                                                                                        <option value="empty">
                                                                                            empty
                                                                                        </option>
                                                                                        <option value="not_empty">
                                                                                            not_empty
                                                                                        </option>
                                                                                    </select>
                                                                                    {rule.operator !==
                                                                                        'empty' &&
                                                                                    rule.operator !==
                                                                                        'not_empty' ? (
                                                                                        <Input
                                                                                            className="h-8 max-w-40 text-xs"
                                                                                            value={
                                                                                                rule.value ??
                                                                                                ''
                                                                                            }
                                                                                            onChange={(
                                                                                                e,
                                                                                            ) => {
                                                                                                const next =
                                                                                                    [
                                                                                                        ...filterRules,
                                                                                                    ];
                                                                                                next[
                                                                                                    index
                                                                                                ] =
                                                                                                    {
                                                                                                        ...rule,
                                                                                                        value: e
                                                                                                            .target
                                                                                                            .value,
                                                                                                    };
                                                                                                setItemFilterRules(
                                                                                                    collection.id,
                                                                                                    next,
                                                                                                );
                                                                                            }}
                                                                                        />
                                                                                    ) : null}
                                                                                    <Button
                                                                                        type="button"
                                                                                        variant="ghost"
                                                                                        size="sm"
                                                                                        className="h-8 px-2 text-xs"
                                                                                        onClick={() =>
                                                                                            setItemFilterRules(
                                                                                                collection.id,
                                                                                                filterRules.filter(
                                                                                                    (
                                                                                                        _,
                                                                                                        i,
                                                                                                    ) =>
                                                                                                        i !==
                                                                                                        index,
                                                                                                ),
                                                                                            )
                                                                                        }
                                                                                    >
                                                                                        Remove
                                                                                    </Button>
                                                                                </div>
                                                                            ),
                                                                        )}
                                                                        <Button
                                                                            type="button"
                                                                            variant="outline"
                                                                            size="sm"
                                                                            className="h-8 text-xs"
                                                                            onClick={() =>
                                                                                setItemFilterRules(
                                                                                    collection.id,
                                                                                    [
                                                                                        ...filterRules,
                                                                                        {
                                                                                            field:
                                                                                                fieldOptions[0]
                                                                                                    ?.name ??
                                                                                                '',
                                                                                            operator:
                                                                                                'equals',
                                                                                            value: '',
                                                                                        },
                                                                                    ],
                                                                                )
                                                                            }
                                                                        >
                                                                            Add
                                                                            filter
                                                                            rule
                                                                        </Button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        ) : null}
                                                    </Fragment>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            <InputError
                                message={form.errors.collection_permissions}
                            />
                        </section>
                    </form>
                </div>
            </SettingsLayout>
        </AppLayout>
    );
}
