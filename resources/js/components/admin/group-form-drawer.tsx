import { useForm } from '@inertiajs/react';
import { useEffect } from 'react';
import { RoleMultiSelect } from '@/components/admin/role-multi-select';
import { UserMultiSelect } from '@/components/admin/user-multi-select';
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
import type { AdminGroupRow } from '@/types/admin';

export type GroupFormDrawerProps = {
    editing: AdminGroupRow | null;
    readOnly?: boolean;
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
    onSuccess,
}: GroupFormDrawerProps) {
    const form = useForm({
        name: '',
        description: '',
        role_ids: [] as number[],
        user_ids: [] as number[],
    });

    useEffect(() => {
        if (editing) {
            form.setData({
                name: editing.name,
                description: editing.description ?? '',
                role_ids: editing.roles.map((r) => r.id),
                user_ids: [],
            });
        } else {
            form.reset();
            form.clearErrors();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
                    Groups inherit role permissions to all members.
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
                        onChange={(e) => form.setData('name', e.target.value)}
                        required
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
                        disabled={readOnly}
                    />
                    <InputError message={form.errors.description} />
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
                    <Label>Users</Label>
                    <UserMultiSelect
                        value={form.data.user_ids}
                        onChange={(user_ids) => form.setData('user_ids', user_ids)}
                        disabled={readOnly}
                    />
                    <InputError message={form.errors.user_ids} />
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
