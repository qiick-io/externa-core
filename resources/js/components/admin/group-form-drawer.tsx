import { useForm } from '@inertiajs/react';
import { useEffect } from 'react';
import { RoleMultiSelect } from '@/components/admin/role-multi-select';
import { UserMultiSelect } from '@/components/admin/user-multi-select';
import InputError from '@/components/input-error';
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
import type { AdminGroupRow } from '@/types/admin';

const EMPTY_GROUP_FORM = {
    name: '',
    description: '',
    role_ids: [] as number[],
    user_ids: [] as number[],
};

export type GroupFormDrawerProps = {
    editing: AdminGroupRow | null;
    readOnly?: boolean;
    open?: boolean;
    /** Prefer over DrawerClose so leave goes through requestLeave. */
    onCancel?: () => void;
    onSuccess?: () => void;
};

/**
 * Drawer form for creating and editing user groups.
 * @param {*} props - Component props.
 * @returns {JSX.Element}
 */
export function GroupFormDrawer({
    editing,
    readOnly = false,
    open = true,
    onCancel,
    onSuccess,
}: GroupFormDrawerProps) {
    const form = useForm({ ...EMPTY_GROUP_FORM });

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
                name: editing.name,
                description: editing.description ?? '',
                role_ids: editing.role_ids ?? editing.roles.map((r) => r.id),
                user_ids:
                    editing.user_ids ?? editing.users?.map((u) => u.id) ?? [],
            };
            form.setData(payload);
            form.setDefaults({ ...payload });
        } else {
            form.setDefaults({ ...EMPTY_GROUP_FORM });
            form.reset();
            form.clearErrors();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
            form.put(adminRoutes.groups.update(editing.id), opts);
        } else {
            form.post(adminRoutes.groups.store(), opts);
        }
    };

    const title = editing ? 'Edit group' : 'New group';

    return (
        <DrawerContent>
            <DrawerHeader>
                <DrawerTitle>{title}</DrawerTitle>
                <DrawerDescription>
                    Attach Spatie roles to this group so members inherit admin
                    permissions and any collection/file ACL tied to those roles.
                    Prefer groups for large memberships instead of assigning
                    roles user-by-user.
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
                    <div className="grid gap-2">
                        <Label htmlFor="group_name">Name</Label>
                        <Input
                            id="group_name"
                            value={form.data.name}
                            onChange={(e) =>
                                form.setData('name', e.target.value)
                            }
                            required
                            maxLength={STRING_LIMITS.NAME}
                            disabled={readOnly}
                        />
                        <InputError message={form.errors.name} />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="group_description">Description</Label>
                        <Input
                            id="group_description"
                            value={form.data.description}
                            onChange={(e) =>
                                form.setData('description', e.target.value)
                            }
                            maxLength={STRING_LIMITS.DESCRIPTION}
                            disabled={readOnly}
                        />
                        <InputError message={form.errors.description} />
                    </div>

                    <div className="grid gap-2">
                        <Label>Roles</Label>
                        <RoleMultiSelect
                            value={form.data.role_ids}
                            onChange={(role_ids) =>
                                form.setData('role_ids', role_ids)
                            }
                            initialRoles={editing?.roles}
                            disabled={readOnly}
                        />
                        <p className="text-xs text-muted-foreground">
                            Members inherit these roles’ Spatie permissions and
                            collection/file access matrices.
                        </p>
                        <InputError message={form.errors.role_ids} />
                    </div>

                    <div className="grid gap-2">
                        <Label>Users</Label>
                        <UserMultiSelect
                            value={form.data.user_ids}
                            onChange={(user_ids) =>
                                form.setData('user_ids', user_ids)
                            }
                            initialUsers={editing?.users}
                            disabled={readOnly}
                        />
                        <InputError message={form.errors.user_ids} />
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
