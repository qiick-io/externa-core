import { useForm } from '@inertiajs/react';
import { useEffect } from 'react';
import { RoleMultiSelect } from '@/components/admin/role-multi-select';
import { UserGroupMultiSelect } from '@/components/admin/user-group-multi-select';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import {
    DrawerBody,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import adminRoutes from '@/lib/admin-routes';
import type { AdminUserRow } from '@/types/admin';

export type UserFormDrawerProps = {
    editing: AdminUserRow | null;
    readOnly?: boolean;
    onSuccess?: () => void;
};

/**
 * Drawer form for creating and editing admin users.
 * @param {*} props - Component props.
 * @returns {JSX.Element}
 */
export function UserFormDrawer({
    editing,
    readOnly = false,
    onSuccess,
}: UserFormDrawerProps) {
    const form = useForm({
        first_name: '',
        last_name: '',
        email: '',
        username: '',
        password: '',
        is_active: true,
        role_ids: [] as number[],
        group_ids: [] as number[],
    });

    useEffect(() => {
        if (editing) {
            form.setData({
                first_name: editing.first_name,
                last_name: editing.last_name ?? '',
                email: editing.email,
                username: (editing.username as string | undefined) ?? '',
                password: '',
                is_active: editing.is_active,
                role_ids: editing.roles.map((r) => r.id),
                group_ids: editing.groups.map((g) => g.id),
            });
        } else {
            form.reset();
            form.clearErrors();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- Inertia form identity is unstable
    }, [editing]);

    const submit = (): void => {
        const opts = {
            preserveScroll: true,
            onSuccess: () => {
                form.reset();
                onSuccess?.();
            },
        };

        if (editing) {
            form.transform((data) => ({
                ...data,
                password: data.password || undefined,
            }));
            form.put(adminRoutes.users.update(editing.id), opts);
        } else {
            form.post(adminRoutes.users.store(), opts);
        }
    };

    const title = editing ? 'Edit user' : 'New user';

    return (
        <DrawerContent>
            <DrawerHeader>
                <DrawerTitle>{title}</DrawerTitle>
                <DrawerDescription>
                    {editing
                        ? 'Update profile, direct roles, and group memberships. Groups inherit their attached roles’ permissions and collection/file ACL.'
                        : 'Create a user and assign direct roles and/or groups. Prefer groups when many users share the same role set.'}
                </DrawerDescription>
            </DrawerHeader>

            <form
                className="flex min-h-0 flex-1 flex-col overflow-hidden"
                onSubmit={(e) => {
                    e.preventDefault();

                    if (!readOnly) {
                        submit();
                    }
                }}
            >
                <DrawerBody className="flex flex-col gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                        <Label htmlFor="user_first_name">First name</Label>
                        <Input
                            id="user_first_name"
                            value={form.data.first_name}
                            onChange={(e) =>
                                form.setData('first_name', e.target.value)
                            }
                            required
                            disabled={readOnly}
                        />
                        <InputError message={form.errors.first_name} />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="user_last_name">Last name</Label>
                        <Input
                            id="user_last_name"
                            value={form.data.last_name}
                            onChange={(e) =>
                                form.setData('last_name', e.target.value)
                            }
                            disabled={readOnly}
                        />
                        <InputError message={form.errors.last_name} />
                    </div>
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="user_email">Email</Label>
                    <Input
                        id="user_email"
                        type="email"
                        value={form.data.email}
                        onChange={(e) => form.setData('email', e.target.value)}
                        required
                        disabled={readOnly}
                    />
                    <InputError message={form.errors.email} />
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="user_username">Username</Label>
                    <Input
                        id="user_username"
                        value={form.data.username}
                        onChange={(e) =>
                            form.setData('username', e.target.value)
                        }
                        disabled={readOnly}
                    />
                    <InputError message={form.errors.username} />
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="user_password">
                        {editing ? 'New password (optional)' : 'Password'}
                    </Label>
                    <Input
                        id="user_password"
                        type="password"
                        value={form.data.password}
                        onChange={(e) =>
                            form.setData('password', e.target.value)
                        }
                        required={!editing}
                        disabled={readOnly}
                        autoComplete="new-password"
                    />
                    <InputError message={form.errors.password} />
                </div>

                <div className="flex items-center gap-2">
                    <input
                        id="user_is_active"
                        type="checkbox"
                        className="size-4 rounded border"
                        checked={form.data.is_active}
                        onChange={(e) =>
                            form.setData('is_active', e.target.checked)
                        }
                        disabled={readOnly}
                    />
                    <Label htmlFor="user_is_active">Active</Label>
                </div>

                <div className="grid gap-2">
                    <Label>Roles</Label>
                    <RoleMultiSelect
                        value={form.data.role_ids}
                        onChange={(role_ids) => form.setData('role_ids', role_ids)}
                        initialRoles={editing?.roles}
                        disabled={readOnly}
                    />
                    <InputError message={form.errors.role_ids} />
                </div>

                <div className="grid gap-2">
                    <Label>Groups</Label>
                    <UserGroupMultiSelect
                        value={form.data.group_ids}
                        onChange={(group_ids) =>
                            form.setData('group_ids', group_ids)
                        }
                        initialGroups={editing?.groups}
                        disabled={readOnly}
                    />
                    <p className="text-muted-foreground text-xs">
                        Group roles are unioned with direct roles for admin
                        permissions and collection/file access.
                    </p>
                    <InputError message={form.errors.group_ids} />
                </div>
                </DrawerBody>

                <DrawerFooter className="flex flex-row justify-end gap-2">
                    <DrawerClose asChild>
                        <Button type="button" variant="outline">
                            Cancel
                        </Button>
                    </DrawerClose>
                    {!readOnly && (
                        <Button type="submit" disabled={form.processing}>
                            {editing ? 'Save' : 'Create'}
                        </Button>
                    )}
                </DrawerFooter>
            </form>
        </DrawerContent>
    );
}
