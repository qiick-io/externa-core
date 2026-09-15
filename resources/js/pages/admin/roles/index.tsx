import { Head, Link, router, usePage } from '@inertiajs/react';
import { Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HeaderIconButton } from '@/components/admin/header-icon-button';
import { ConfirmDestructiveDialog } from '@/components/confirm-destructive-dialog';
import {
    PageLayout,
    TablePagination,
    TablePanel,
} from '@/components/layout/page-layout';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { PermissionEnum } from '@/enums/permission-enum';
import { useCan } from '@/hooks/use-can';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import adminRoutes from '@/lib/admin-routes';
import { normalizePaginated } from '@/lib/pagination';
import type { LaravelPaginated } from '@/lib/pagination';
import { edit as editProfile } from '@/routes/profile';
import type { AdminRoleRow, BreadcrumbItem, Paginated } from '@/types';

/**
 * Admin roles list with permissions overview and icon row actions.
 */
export default function AdminRolesIndex({
    roles: rolesProp,
}: {
    roles: LaravelPaginated<AdminRoleRow> | Paginated<AdminRoleRow>;
}) {
    const { t } = useTranslation();
    const { can } = useCan();
    const page = usePage();
    const roles = normalizePaginated(rolesProp);
    const rows = roles.data;
    const [pendingRoleId, setPendingRoleId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [duplicateRoleId, setDuplicateRoleId] = useState<number | null>(null);
    const [duplicateName, setDuplicateName] = useState('');
    const [duplicating, setDuplicating] = useState(false);
    const [duplicateError, setDuplicateError] = useState<string | null>(null);

    const pendingRole = rows.find((role) => role.id === pendingRoleId);
    const duplicateRole = rows.find((role) => role.id === duplicateRoleId);
    const pageErrors = page.props.errors as Record<string, string> | undefined;

    useEffect(() => {
        if (duplicateRoleId === null || !pageErrors?.name) {
            return;
        }

        setDuplicateError(pageErrors.name);
        setDuplicating(false);
    }, [duplicateRoleId, pageErrors]);

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
        ],
        [t],
    );

    const canDuplicateRole = (role: AdminRoleRow): boolean =>
        can(PermissionEnum.CanCreateRoles) &&
        !role.is_system &&
        role.name !== 'super-admin';

    const openDuplicateDialog = (role: AdminRoleRow): void => {
        setDuplicateRoleId(role.id);
        setDuplicateName(`${role.name}-copy`);
        setDuplicateError(null);
    };

    const submitDuplicate = (): void => {
        if (duplicateRoleId === null) {
            return;
        }

        const trimmed = duplicateName.trim();

        if (trimmed === '') {
            setDuplicateError(t('roles.duplicate.name'));

            return;
        }

        setDuplicating(true);
        setDuplicateError(null);

        router.post(
            adminRoutes.roles.duplicate(duplicateRoleId),
            { name: trimmed },
            {
                preserveScroll: true,
                onFinish: () => setDuplicating(false),
                onSuccess: () => {
                    setDuplicateRoleId(null);
                    setDuplicateName('');
                },
                onError: (errors) => {
                    setDuplicateError(
                        typeof errors.name === 'string'
                            ? errors.name
                            : t('roles.duplicate.name'),
                    );
                },
            },
        );
    };

    return (
        <AppLayout
            breadcrumbs={breadcrumbs}
            headerActions={
                can(PermissionEnum.CanCreateRoles) ? (
                    <Button asChild>
                        <Link href={adminRoutes.roles.create()}>
                            <Plus className="mr-1 size-4" />
                            {t('roles.actions.newRole')}
                        </Link>
                    </Button>
                ) : undefined
            }
        >
            <Head title={t('settings.layout.roles')} />

            <SettingsLayout wide>
                <PageLayout className="p-0">
                    <TablePanel
                        footer={
                            roles.last_page > 1 ? (
                                <TablePagination links={roles.links ?? []} />
                            ) : undefined
                        }
                    >
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>
                                        {t('roles.columns.name')}
                                    </TableHead>
                                    <TableHead>
                                        {t('roles.columns.permissions')}
                                    </TableHead>
                                    <TableHead className="text-right">
                                        {t('roles.columns.actions')}
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={3}
                                            className="text-muted-foreground"
                                        >
                                            {t('roles.empty')}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    rows.map((role) => (
                                        <TableRow key={role.id}>
                                            <TableCell className="font-medium">
                                                <span className="inline-flex items-center gap-2">
                                                    {role.name}
                                                    {role.is_system && (
                                                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                                                            {t(
                                                                'roles.systemBadge',
                                                            )}
                                                        </span>
                                                    )}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {role.permissions_count ?? '—'}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="inline-flex items-center justify-end gap-1">
                                                    {can(
                                                        PermissionEnum.CanEditRoles,
                                                    ) && (
                                                        <HeaderIconButton
                                                            variant="outline"
                                                            size="icon"
                                                            className="size-8"
                                                            label={t(
                                                                'roles.actions.edit',
                                                            )}
                                                            asChild
                                                        >
                                                            <Link
                                                                href={adminRoutes.roles.edit(
                                                                    role.id,
                                                                )}
                                                            >
                                                                <Pencil className="size-3.5" />
                                                            </Link>
                                                        </HeaderIconButton>
                                                    )}
                                                    {canDuplicateRole(role) && (
                                                        <HeaderIconButton
                                                            type="button"
                                                            variant="outline"
                                                            size="icon"
                                                            className="size-8"
                                                            label={t(
                                                                'roles.actions.duplicate',
                                                            )}
                                                            onClick={() =>
                                                                openDuplicateDialog(
                                                                    role,
                                                                )
                                                            }
                                                        >
                                                            <Copy className="size-3.5" />
                                                        </HeaderIconButton>
                                                    )}
                                                    {can(
                                                        PermissionEnum.CanDeleteRoles,
                                                    ) &&
                                                        !role.is_system &&
                                                        role.name !==
                                                            'super-admin' && (
                                                            <HeaderIconButton
                                                                type="button"
                                                                variant="destructive"
                                                                size="icon"
                                                                className="size-8"
                                                                label={t(
                                                                    'roles.actions.delete',
                                                                )}
                                                                onClick={() =>
                                                                    setPendingRoleId(
                                                                        role.id,
                                                                    )
                                                                }
                                                            >
                                                                <Trash2 className="size-3.5" />
                                                            </HeaderIconButton>
                                                        )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TablePanel>
                </PageLayout>
            </SettingsLayout>

            <ConfirmDestructiveDialog
                open={pendingRoleId !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setPendingRoleId(null);
                    }
                }}
                title={t('roles.deleteTitle')}
                description={
                    pendingRole
                        ? t('roles.deleteDescription', {
                              name: pendingRole.name,
                          })
                        : t('roles.deleteFallback')
                }
                confirming={deleting}
                onConfirm={() => {
                    if (pendingRoleId === null) {
                        return;
                    }

                    setDeleting(true);
                    router.delete(adminRoutes.roles.destroy(pendingRoleId), {
                        preserveScroll: true,
                        onFinish: () => setDeleting(false),
                        onSuccess: () => setPendingRoleId(null),
                        onError: () => setPendingRoleId(null),
                    });
                }}
            />

            <Dialog
                open={duplicateRoleId !== null}
                onOpenChange={(open) => {
                    if (!open && !duplicating) {
                        setDuplicateRoleId(null);
                        setDuplicateName('');
                        setDuplicateError(null);
                    }
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('roles.duplicate.title')}</DialogTitle>
                        <DialogDescription>
                            {duplicateRole
                                ? t('roles.duplicate.description', {
                                      name: duplicateRole.name,
                                  })
                                : null}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-2">
                        <Label htmlFor="role-duplicate-name">
                            {t('roles.duplicate.name')}
                        </Label>
                        <Input
                            id="role-duplicate-name"
                            value={duplicateName}
                            autoFocus
                            disabled={duplicating}
                            onChange={(event) =>
                                setDuplicateName(event.target.value)
                            }
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    submitDuplicate();
                                }
                            }}
                        />
                        {duplicateError ? (
                            <p className="text-sm text-destructive">
                                {duplicateError}
                            </p>
                        ) : null}
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={duplicating}
                            onClick={() => {
                                setDuplicateRoleId(null);
                                setDuplicateName('');
                                setDuplicateError(null);
                            }}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button
                            type="button"
                            disabled={duplicating}
                            onClick={submitDuplicate}
                        >
                            {duplicating
                                ? t('roles.duplicate.duplicating')
                                : t('roles.duplicate.submit')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
