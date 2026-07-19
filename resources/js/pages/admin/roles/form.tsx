import { Head, Link, useForm } from '@inertiajs/react';
import { useEffect, useMemo } from 'react';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AppLayout from '@/layouts/app-layout';
import adminRoutes from '@/lib/admin-routes';
import type { AdminRoleRow, BreadcrumbItem, PermissionGroup } from '@/types';

type RoleFormRole = AdminRoleRow & {
    permissions?: { id: number; name: string }[];
};

/**
 * Create or edit role with permission matrix.
 * @returns {JSX.Element}
 */
export default function AdminRoleForm({
    role,
    permissionGroups,
}: {
    role?: RoleFormRole | null;
    permissionGroups: PermissionGroup[];
}) {
    const isEdit = Boolean(role?.id);

    const form = useForm({
        name: role?.name ?? '',
        permission_ids: [] as number[],
    });

    useEffect(() => {
        if (role?.permissions?.length) {
            form.setData(
                'permission_ids',
                role.permissions.map((p) => p.id),
            );
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [role?.id]);

    const breadcrumbs: BreadcrumbItem[] = useMemo(
        () => [
            { title: 'Roles', href: adminRoutes.roles.index() },
            {
                title: isEdit ? 'Edit role' : 'New role',
                href: isEdit
                    ? adminRoutes.roles.edit(role!.id)
                    : adminRoutes.roles.create(),
            },
        ],
        [isEdit, role?.id],
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

            <div className="flex flex-col gap-6 p-4">
                <form
                    className="mx-auto flex w-full max-w-4xl flex-col gap-6"
                    onSubmit={(e) => {
                        e.preventDefault();
                        submit();
                    }}
                >
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <h1 className="text-xl font-semibold tracking-tight">
                            {isEdit ? 'Edit role' : 'New role'}
                        </h1>
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
                        />
                        <InputError message={form.errors.name} />
                    </div>

                    <div className="space-y-6">
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
                                                toggleGroup(group, c === true)
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
                                            <label
                                                className="flex items-center gap-2 text-sm font-medium"
                                            >
                                                <Checkbox
                                                    checked={form.data.permission_ids.includes(
                                                        group.show_permission
                                                            .id,
                                                    )}
                                                    onCheckedChange={(c) =>
                                                        togglePermission(
                                                            group.show_permission!
                                                                .id,
                                                            c === true,
                                                        )
                                                    }
                                                />
                                                <span>
                                                    {group.show_permission.name}
                                                </span>
                                            </label>
                                        )}
                                        {group.child_permissions.map((perm) => (
                                            <label
                                                key={perm.id}
                                                className="flex items-center gap-2 text-sm"
                                            >
                                                <Checkbox
                                                    checked={form.data.permission_ids.includes(
                                                        perm.id,
                                                    )}
                                                    onCheckedChange={(c) =>
                                                        togglePermission(
                                                            perm.id,
                                                            c === true,
                                                        )
                                                    }
                                                />
                                                <span>{perm.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                </section>
                            );
                        })}
                    </div>
                </form>
            </div>
        </AppLayout>
    );
}
