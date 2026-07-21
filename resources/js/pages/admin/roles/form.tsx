import { Head, Link, useForm } from '@inertiajs/react';
import { Check, X } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

type CollectionRow = { id: number; name: string; slug: string };

type CollectionActions = {
    create: boolean;
    read: boolean;
    update: boolean;
    delete: boolean;
};

type FileActions = CollectionActions;

const ACTIONS = [
    { key: 'create' as const, label: 'Create' },
    { key: 'read' as const, label: 'Read' },
    { key: 'update' as const, label: 'Update' },
    { key: 'delete' as const, label: 'Delete' },
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
            update: filePermissions.update ?? false,
            delete: filePermissions.delete ?? false,
        } as FileActions,
    });

    useEffect(() => {
        if (role?.permissions?.length) {
            form.setData(
                'permission_ids',
                role.permissions.map((p) => p.id),
            );
        }
        form.setData('collection_permissions', emptyMatrix());
        form.setData('file_permissions', {
            create: filePermissions.create ?? false,
            read: filePermissions.read ?? false,
            update: filePermissions.update ?? false,
            delete: filePermissions.delete ?? false,
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
        [isEdit, role?.id, t],
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
            checked
                ? [...current, id]
                : current.filter((pid) => pid !== id),
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
        action: keyof CollectionActions,
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
                                <p className="text-muted-foreground mt-1 text-sm">
                                    System role — name is locked; not assignable
                                    to users.
                                </p>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" asChild>
                                <Link href={adminRoutes.roles.index()}>
                                    Cancel
                                </Link>
                            </Button>
                            <Button type="submit" disabled={form.processing}>
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
                                        form.data.permission_ids.includes(id),
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
                                                        onCheckedChange={(c) =>
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
                                                                    c === true,
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
                            <p className="text-muted-foreground text-sm">
                                Public CMS API file permissions (create / read /
                                update / delete). Global for all files — missing
                                grant = deny.
                            </p>
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-sidebar-border/70 dark:border-sidebar-border">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-muted/40">
                                        <th className="px-3 py-2 text-left font-medium">
                                            Resource
                                        </th>
                                        {ACTIONS.map((action) => (
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
                                            <div className="text-muted-foreground text-xs">
                                                /api/v1/files
                                            </div>
                                        </td>
                                        {ACTIONS.map((action) => {
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
                                                        aria-pressed={allowed}
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
                        <InputError message={form.errors.file_permissions} />
                    </section>

                    <section className="space-y-3">
                        <div>
                            <h2 className="text-lg font-medium">
                                Collection access
                            </h2>
                            <p className="text-muted-foreground text-sm">
                                Public CMS API permissions (create / read /
                                update / delete). Missing grant = deny.
                            </p>
                        </div>

                        {collections.length === 0 ? (
                            <p className="text-muted-foreground text-sm">
                                No collections yet.
                            </p>
                        ) : (
                            <div className="overflow-x-auto rounded-xl border border-sidebar-border/70 dark:border-sidebar-border">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-muted/40">
                                            <th className="px-3 py-2 text-left font-medium">
                                                Collection
                                            </th>
                                            {ACTIONS.map((action) => (
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
                                        {collections.map((collection) => {
                                            const key = String(collection.id);
                                            const row =
                                                form.data
                                                    .collection_permissions[
                                                    key
                                                ] ?? {
                                                    create: false,
                                                    read: false,
                                                    update: false,
                                                    delete: false,
                                                };

                                            return (
                                                <tr
                                                    key={collection.id}
                                                    className="border-b last:border-0"
                                                >
                                                    <td className="px-3 py-2">
                                                        <div className="font-medium">
                                                            {collection.name}
                                                        </div>
                                                        <div className="text-muted-foreground text-xs">
                                                            {collection.slug}
                                                        </div>
                                                    </td>
                                                    {ACTIONS.map((action) => {
                                                        const allowed =
                                                            row[action.key];
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
                                                                            strokeWidth={2.5}
                                                                            aria-hidden
                                                                        />
                                                                    ) : (
                                                                        <X
                                                                            className="size-4"
                                                                            strokeWidth={2.5}
                                                                            aria-hidden
                                                                        />
                                                                    )}
                                                                </button>
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
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
