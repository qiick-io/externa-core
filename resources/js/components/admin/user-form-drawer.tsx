import { useForm, usePage } from '@inertiajs/react';
import { useEffect } from 'react';
import { RoleMultiSelect } from '@/components/admin/role-multi-select';
import { UserGroupMultiSelect } from '@/components/admin/user-group-multi-select';
import InputError from '@/components/input-error';
import PasswordInput from '@/components/password-input';
import { Button } from '@/components/ui/button';
import {
    DrawerBody,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRegisterUnsavedChanges } from '@/hooks/use-unsaved-changes';
import adminRoutes from '@/lib/admin-routes';
import { STRING_LIMITS } from '@/lib/string-limits';
import type { AdminUserRow } from '@/types/admin';

const EMPTY_USER_FORM = {
    first_name: '',
    last_name: '',
    email: '',
    username: '',
    password: '',
    is_active: true,
    role_ids: [] as number[],
    group_ids: [] as number[],
};

export type UserFormDrawerProps = {
    editing: AdminUserRow | null;
    readOnly?: boolean;
    open?: boolean;
    /** Prefer over DrawerClose so leave goes through requestLeave. */
    onCancel?: () => void;
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
    open = true,
    onCancel,
    onSuccess,
}: UserFormDrawerProps) {
    const form = useForm({ ...EMPTY_USER_FORM });
    const { projectSettings } = usePage().props;
    const isCreate = editing === null;
    const roleIsRequired = isCreate;

    useRegisterUnsavedChanges({
        scope: 'drawer',
        isDirty: form.isDirty,
        enabled: open && !readOnly,
        onDiscard: () => {
            form.reset();
            form.clearErrors();
        },
    });

    useEffect(() => {
        if (!open) {
            return;
        }

        if (editing) {
            // Fresh object for setDefaults — avoid sharing the setData reference.
            const payload = {
                first_name: editing.first_name,
                last_name: editing.last_name ?? '',
                email: editing.email,
                username: (editing.username as string | undefined) ?? '',
                password: '',
                is_active: editing.is_active,
                role_ids: editing.roles.map((r) => r.id),
                group_ids: editing.groups.map((g) => g.id),
            };
            form.setData(payload);
            form.setDefaults({ ...payload });
        } else {
            form.setDefaults({ ...EMPTY_USER_FORM });
            form.reset();
            form.clearErrors();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- Inertia form identity is unstable
    }, [editing, open]);

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
                    <p className="text-sm text-muted-foreground">
                        Fields marked with * are required.
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-2">
                            <Label htmlFor="user_first_name">
                                First name *
                            </Label>
                            <Input
                                id="user_first_name"
                                value={form.data.first_name}
                                onChange={(e) =>
                                    form.setData('first_name', e.target.value)
                                }
                                required
                                maxLength={STRING_LIMITS.NAME}
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
                                maxLength={STRING_LIMITS.NAME}
                                disabled={readOnly}
                            />
                            <InputError message={form.errors.last_name} />
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="user_email">Email *</Label>
                        <Input
                            id="user_email"
                            type="email"
                            inputMode="email"
                            value={form.data.email}
                            onChange={(e) =>
                                form.setData('email', e.target.value)
                            }
                            required
                            maxLength={STRING_LIMITS.EMAIL}
                            disabled={readOnly}
                            autoComplete="email"
                            aria-describedby="user_email_hint"
                        />
                        <p
                            id="user_email_hint"
                            className="text-xs text-muted-foreground"
                        >
                            Use a valid email address, for example{' '}
                            <code>name@example.com</code>.
                        </p>
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
                            maxLength={STRING_LIMITS.USERNAME}
                            disabled={readOnly}
                        />
                        <InputError message={form.errors.username} />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="user_password">
                            {editing ? 'New password (optional)' : 'Password *'}
                        </Label>
                        <PasswordInput
                            id="user_password"
                            value={form.data.password}
                            onChange={(e) =>
                                form.setData('password', e.target.value)
                            }
                            required={isCreate}
                            disabled={readOnly}
                            autoComplete="new-password"
                            showGenerateButton={isCreate}
                            generateLabel="Generate secure password"
                            onGenerated={(password) =>
                                form.setData('password', password)
                            }
                            showStrength={isCreate}
                            strengthPolicy={projectSettings.passwordPolicy}
                            strengthId="user_password_strength"
                            aria-describedby="user_password_strength"
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
                        <Label>Roles{roleIsRequired ? ' *' : ''}</Label>
                        <RoleMultiSelect
                            value={form.data.role_ids}
                            onChange={(role_ids) =>
                                form.setData('role_ids', role_ids)
                            }
                            initialRoles={editing?.roles}
                            disabled={readOnly}
                            placeholder={
                                roleIsRequired
                                    ? 'Select at least one role'
                                    : 'Select roles…'
                            }
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
                        <p className="text-xs text-muted-foreground">
                            Group roles are unioned with direct roles for admin
                            permissions and collection/file access.
                        </p>
                        <InputError message={form.errors.group_ids} />
                    </div>
                </DrawerBody>

                <DrawerFooter className="flex flex-row justify-end gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onCancel?.()}
                    >
                        Cancel
                    </Button>
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
