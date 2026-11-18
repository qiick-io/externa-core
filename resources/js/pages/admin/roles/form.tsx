import { Head, Link, useForm } from '@inertiajs/react';
import { Check, FolderOpen, Search, SearchX, X } from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { PageEmptyState } from '@/components/admin/page-empty-state';
import { EmptyStatus } from '@/components/empty-status';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Field,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
    FieldLegend,
    FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Toggle } from '@/components/ui/toggle';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { UnsavedChangesToolbar } from '@/components/unsaved-changes-toolbar';
import { useRegisterUnsavedChanges } from '@/hooks/use-unsaved-changes';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { cn } from '@/lib/utils';
import collectionRoutes from '@/routes/collections';
import { edit as editProfile } from '@/routes/profile';
import rolesRoutes from '@/routes/roles';
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
    { key: 'create' as const, labelKey: 'roles.form.actions.create' },
    { key: 'read' as const, labelKey: 'roles.form.actions.read' },
    {
        key: 'read_private' as const,
        labelKey: 'roles.form.actions.readPrivate',
    },
    { key: 'update' as const, labelKey: 'roles.form.actions.update' },
    { key: 'delete' as const, labelKey: 'roles.form.actions.delete' },
];

const COLLECTION_ACTIONS = [
    { key: 'create' as const, labelKey: 'roles.form.actions.create' },
    { key: 'read' as const, labelKey: 'roles.form.actions.read' },
    { key: 'update' as const, labelKey: 'roles.form.actions.update' },
    { key: 'delete' as const, labelKey: 'roles.form.actions.delete' },
];

const FIELD_ACTIONS = [
    { key: 'read' as const, labelKey: 'roles.form.actions.read' },
    { key: 'create' as const, labelKey: 'roles.form.actions.create' },
    { key: 'update' as const, labelKey: 'roles.form.actions.update' },
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
    createDirectChatsPermission = null,
}: {
    role?: RoleFormRole | { data: RoleFormRole } | null;
    permissionGroups: PermissionGroup[];
    collections?: CollectionRow[];
    collectionPermissions?: Record<string, CollectionActions>;
    filePermissions?: FileActions;
    createDirectChatsPermission?: { id: number; name: string } | null;
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
        // oxlint-disable-next-line react-hooks/exhaustive-deps -- reseed only when another role loads or the collections arrive; Inertia useForm identity changes every render
    }, [role?.id, collections.length]);

    const breadcrumbs: BreadcrumbItem[] = useMemo(
        () => [
            {
                title: t('settings.layout.title'),
                href: editProfile(),
            },
            {
                title: t('settings.layout.roles'),
                href: rolesRoutes.index.url(),
            },
            {
                title: isEdit
                    ? t('roles.form.editTitle')
                    : t('roles.actions.newRole'),
                href: isEdit
                    ? rolesRoutes.edit.url(role!.id)
                    : rolesRoutes.create.url(),
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
            form.put(rolesRoutes.update.url(role!.id), opts);
        } else {
            form.post(rolesRoutes.store.url(), opts);
        }
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head
                title={
                    isEdit
                        ? t('roles.form.editNamed', { name: role?.name })
                        : t('roles.actions.newRole')
                }
            />

            <SettingsLayout wide>
                <div className="flex min-h-0 flex-1 flex-col gap-6">
                    <form
                        className="flex w-full flex-col gap-6"
                        noValidate
                        onSubmit={(e) => {
                            e.preventDefault();
                            submit();
                        }}
                    >
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <div>
                                <h1 className="text-xl font-semibold tracking-tight">
                                    {isEdit
                                        ? t('roles.form.editTitle')
                                        : t('roles.actions.newRole')}
                                </h1>
                                {isSystem && (
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        {t('roles.form.systemRoleHint')}
                                    </p>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <UnsavedChangesToolbar
                                    isDirty={form.isDirty}
                                    className="flex items-center gap-2"
                                />
                                <Button variant="outline" asChild>
                                    <Link href={rolesRoutes.index.url()}>
                                        {t('common.cancel')}
                                    </Link>
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={form.processing}
                                >
                                    {isEdit
                                        ? t('common.save')
                                        : t('roles.form.create')}
                                </Button>
                            </div>
                        </div>

                        <FieldGroup className="max-w-md">
                            <Field
                                data-invalid={
                                    form.errors.name ? true : undefined
                                }
                            >
                                <FieldLabel htmlFor="role_name">
                                    {t('roles.columns.name')}
                                </FieldLabel>
                                <Input
                                    id="role_name"
                                    value={form.data.name}
                                    onChange={(e) =>
                                        form.setData('name', e.target.value)
                                    }
                                    required
                                    disabled={isSystem}
                                    aria-invalid={
                                        form.errors.name ? true : undefined
                                    }
                                    aria-describedby={
                                        form.errors.name
                                            ? 'role-name-error'
                                            : undefined
                                    }
                                />
                                <FieldError id="role-name-error">
                                    {form.errors.name}
                                </FieldError>
                            </Field>
                        </FieldGroup>

                        {!isPublic && (
                            <div className="space-y-6">
                                <h2 className="text-lg font-medium">
                                    {t('roles.form.adminPermissions')}
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
                                        <FieldSet
                                            key={group.section}
                                            className="rounded-xl border border-sidebar-border/70 p-4 dark:border-sidebar-border"
                                        >
                                            <div className="mb-3 flex flex-wrap items-center gap-2">
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
                                                <FieldLegend
                                                    variant="label"
                                                    className="mb-0"
                                                >
                                                    <Label
                                                        htmlFor={`section-${group.section}`}
                                                        className="text-base font-semibold"
                                                    >
                                                        {group.label}
                                                    </Label>
                                                </FieldLegend>
                                                <FieldDescription className="font-mono text-xs">
                                                    {group.section}
                                                </FieldDescription>
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
                                        </FieldSet>
                                    );
                                })}
                                {createDirectChatsPermission ? (
                                    <section className="rounded-xl border border-sidebar-border/70 p-4 dark:border-sidebar-border">
                                        <label className="flex items-center gap-2 text-sm font-medium">
                                            <Checkbox
                                                checked={form.data.permission_ids.includes(
                                                    createDirectChatsPermission.id,
                                                )}
                                                onCheckedChange={(c) =>
                                                    togglePermission(
                                                        createDirectChatsPermission.id,
                                                        c === true,
                                                    )
                                                }
                                                aria-label={t(
                                                    'roles.form.createPrivateChats',
                                                )}
                                            />
                                            <span>
                                                {t(
                                                    'roles.form.createPrivateChats',
                                                )}
                                            </span>
                                        </label>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {createDirectChatsPermission.name}
                                        </p>
                                    </section>
                                ) : null}
                            </div>
                        )}

                        <section className="space-y-3">
                            <div>
                                <h2 className="text-lg font-medium">
                                    {t('roles.form.filesAccess')}
                                </h2>
                                <p className="text-sm text-muted-foreground">
                                    <Trans
                                        i18nKey="roles.form.filesAccessDescription"
                                        components={{ strong: <strong /> }}
                                    />
                                </p>
                            </div>

                            <div className="overflow-x-auto rounded-xl bg-card">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>
                                                {t('roles.form.resource')}
                                            </TableHead>
                                            {FILE_ACTIONS.map((action) => (
                                                <TableHead
                                                    key={action.key}
                                                    className="text-center"
                                                >
                                                    {t(action.labelKey)}
                                                </TableHead>
                                            ))}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        <TableRow>
                                            <TableCell>
                                                <div className="font-medium">
                                                    {t('roles.form.files')}
                                                </div>
                                                <div className="font-mono text-xs text-muted-foreground">
                                                    {'/api/v1/files'}
                                                </div>
                                            </TableCell>
                                            {FILE_ACTIONS.map((action) => {
                                                const allowed =
                                                    form.data.file_permissions[
                                                        action.key
                                                    ];

                                                return (
                                                    <TableCell
                                                        key={action.key}
                                                        className="text-center"
                                                    >
                                                        <Toggle
                                                            variant="outline"
                                                            pressed={allowed}
                                                            aria-label={t(
                                                                allowed
                                                                    ? 'roles.form.fileToggleAllowed'
                                                                    : 'roles.form.fileToggleDenied',
                                                                {
                                                                    action: t(
                                                                        action.labelKey,
                                                                    ),
                                                                },
                                                            )}
                                                            title={t(
                                                                allowed
                                                                    ? 'roles.form.toggleTitleAllowed'
                                                                    : 'roles.form.toggleTitleDenied',
                                                                {
                                                                    action: t(
                                                                        action.labelKey,
                                                                    ),
                                                                },
                                                            )}
                                                            className={cn(
                                                                'px-0',
                                                                allowed
                                                                    ? 'border-success/50 bg-success/15 text-success hover:bg-success/25 hover:text-success data-[state=on]:bg-success/15 data-[state=on]:text-success'
                                                                    : 'border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive',
                                                            )}
                                                            onPressedChange={(
                                                                pressed,
                                                            ) =>
                                                                toggleFileAction(
                                                                    action.key,
                                                                    pressed,
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
                                                        </Toggle>
                                                    </TableCell>
                                                );
                                            })}
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            </div>
                            <FieldError id="role-file-permissions-error">
                                {form.errors.file_permissions}
                            </FieldError>
                        </section>

                        <section className="space-y-3">
                            <div className="flex flex-wrap items-end justify-between gap-4">
                                <div>
                                    <h2 className="text-lg font-medium">
                                        {t('roles.form.collectionAccess')}
                                    </h2>
                                    <p className="text-sm text-muted-foreground">
                                        {t(
                                            'roles.form.collectionAccessDescription',
                                        )}
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
                                            placeholder={t(
                                                'roles.form.searchCollections',
                                            )}
                                            className="pl-9"
                                            aria-label={t('a11y.search')}
                                        />
                                    </div>
                                ) : null}
                            </div>

                            {collections.length === 0 ? (
                                <PageEmptyState
                                    icon={FolderOpen}
                                    title={t(
                                        'emptyState.roleCollections.title',
                                    )}
                                    description={t(
                                        'emptyState.roleCollections.description',
                                    )}
                                    action={
                                        <Button asChild>
                                            <Link
                                                href={collectionRoutes.index.url()}
                                            >
                                                {t(
                                                    'emptyState.roleCollections.cta',
                                                )}
                                            </Link>
                                        </Button>
                                    }
                                    compact
                                />
                            ) : filteredCollections.length === 0 ? (
                                <PageEmptyState
                                    icon={SearchX}
                                    title={
                                        <EmptyStatus>
                                            {t(
                                                'emptyState.roleCollections.filteredTitle',
                                            )}
                                        </EmptyStatus>
                                    }
                                    description={t(
                                        'emptyState.roleCollections.filteredDescription',
                                    )}
                                    action={
                                        <Button
                                            type="button"
                                            onClick={() =>
                                                setCollectionSearch('')
                                            }
                                        >
                                            {t('common.clearFilters')}
                                        </Button>
                                    }
                                    compact
                                />
                            ) : (
                                <div className="overflow-x-auto rounded-xl bg-card">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="border-b bg-muted/40">
                                                <TableHead className="text-left">
                                                    {t('roles.form.collection')}
                                                </TableHead>
                                                {COLLECTION_ACTIONS.map(
                                                    (action) => (
                                                        <TableHead
                                                            key={action.key}
                                                            className="text-center"
                                                        >
                                                            {t(action.labelKey)}
                                                        </TableHead>
                                                    ),
                                                )}
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
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
                                                        row.rules ??
                                                        emptyRules();
                                                    const filterRules =
                                                        rules.item_filter
                                                            ?.rules ?? [];
                                                    const fieldOptions =
                                                        collection.fields ?? [];

                                                    return (
                                                        <Fragment
                                                            key={collection.id}
                                                        >
                                                            <TableRow>
                                                                <TableCell>
                                                                    <div className="font-medium">
                                                                        {
                                                                            collection.name
                                                                        }
                                                                    </div>
                                                                    <div className="font-mono text-xs text-muted-foreground">
                                                                        {
                                                                            collection.slug
                                                                        }
                                                                    </div>
                                                                </TableCell>
                                                                {COLLECTION_ACTIONS.map(
                                                                    (
                                                                        action,
                                                                    ) => {
                                                                        const allowed =
                                                                            row[
                                                                                action
                                                                                    .key
                                                                            ];

                                                                        return (
                                                                            <TableCell
                                                                                key={
                                                                                    action.key
                                                                                }
                                                                                className="text-center"
                                                                            >
                                                                                <Toggle
                                                                                    variant="outline"
                                                                                    pressed={
                                                                                        allowed
                                                                                    }
                                                                                    aria-label={t(
                                                                                        allowed
                                                                                            ? 'roles.form.collectionToggleAllowed'
                                                                                            : 'roles.form.collectionToggleDenied',
                                                                                        {
                                                                                            action: t(
                                                                                                action.labelKey,
                                                                                            ),
                                                                                            collection:
                                                                                                collection.name,
                                                                                        },
                                                                                    )}
                                                                                    title={t(
                                                                                        allowed
                                                                                            ? 'roles.form.toggleTitleAllowed'
                                                                                            : 'roles.form.toggleTitleDenied',
                                                                                        {
                                                                                            action: t(
                                                                                                action.labelKey,
                                                                                            ),
                                                                                        },
                                                                                    )}
                                                                                    className={cn(
                                                                                        'px-0',
                                                                                        allowed
                                                                                            ? 'border-success/50 bg-success/15 text-success hover:bg-success/25 hover:text-success data-[state=on]:bg-success/15 data-[state=on]:text-success'
                                                                                            : 'border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive',
                                                                                    )}
                                                                                    onPressedChange={(
                                                                                        pressed,
                                                                                    ) =>
                                                                                        toggleCollectionAction(
                                                                                            collection.id,
                                                                                            action.key,
                                                                                            pressed,
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
                                                                                </Toggle>
                                                                            </TableCell>
                                                                        );
                                                                    },
                                                                )}
                                                            </TableRow>
                                                            {anyGrant &&
                                                            fieldOptions.length >
                                                                0 ? (
                                                                <TableRow
                                                                    key={`${collection.id}-rules`}
                                                                    className="bg-muted/20"
                                                                >
                                                                    <TableCell
                                                                        colSpan={
                                                                            5
                                                                        }
                                                                        className="space-y-3"
                                                                    >
                                                                        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                                                            {t(
                                                                                'roles.form.fieldsAndItemFilter',
                                                                            )}
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
                                                                                            className="grid grid-cols-[minmax(0,1fr)_4.5rem_5rem_5rem] items-center gap-x-3 rounded-md border border-sidebar-border/60 px-3 py-3 text-xs"
                                                                                        >
                                                                                            <Tooltip>
                                                                                                <TooltipTrigger
                                                                                                    asChild
                                                                                                >
                                                                                                    <span className="min-w-0 truncate font-medium">
                                                                                                        {
                                                                                                            field.name
                                                                                                        }
                                                                                                    </span>
                                                                                                </TooltipTrigger>
                                                                                                <TooltipContent>
                                                                                                    {
                                                                                                        field.name
                                                                                                    }
                                                                                                </TooltipContent>
                                                                                            </Tooltip>
                                                                                            {FIELD_ACTIONS.map(
                                                                                                (
                                                                                                    action,
                                                                                                ) => (
                                                                                                    <label
                                                                                                        key={
                                                                                                            action.key
                                                                                                        }
                                                                                                        className="flex items-center gap-2 whitespace-nowrap"
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
                                                                                                        {t(
                                                                                                            action.labelKey,
                                                                                                        )}
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
                                                                                {t(
                                                                                    'roles.form.itemFilter',
                                                                                )}
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
                                                                                        <NativeSelect
                                                                                            className="min-w-28 flex-1"
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
                                                                                        </NativeSelect>
                                                                                        <NativeSelect
                                                                                            className="min-w-28"
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
                                                                                                {t(
                                                                                                    'roles.form.operators.equals',
                                                                                                )}
                                                                                            </option>
                                                                                            <option value="not_equals">
                                                                                                {t(
                                                                                                    'roles.form.operators.notEquals',
                                                                                                )}
                                                                                            </option>
                                                                                            <option value="empty">
                                                                                                {t(
                                                                                                    'roles.form.operators.empty',
                                                                                                )}
                                                                                            </option>
                                                                                            <option value="not_empty">
                                                                                                {t(
                                                                                                    'roles.form.operators.notEmpty',
                                                                                                )}
                                                                                            </option>
                                                                                        </NativeSelect>
                                                                                        {rule.operator !==
                                                                                            'empty' &&
                                                                                        rule.operator !==
                                                                                            'not_empty' ? (
                                                                                            <Input
                                                                                                className="max-w-40"
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
                                                                                            className="px-2"
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
                                                                                            {t(
                                                                                                'roles.form.removeRule',
                                                                                            )}
                                                                                        </Button>
                                                                                    </div>
                                                                                ),
                                                                            )}
                                                                            <Button
                                                                                type="button"
                                                                                variant="outline"
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
                                                                                {t(
                                                                                    'roles.form.addFilterRule',
                                                                                )}
                                                                            </Button>
                                                                        </div>
                                                                    </TableCell>
                                                                </TableRow>
                                                            ) : null}
                                                        </Fragment>
                                                    );
                                                },
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                            <FieldError id="role-collection-permissions-error">
                                {form.errors.collection_permissions}
                            </FieldError>
                        </section>
                    </form>
                </div>
            </SettingsLayout>
        </AppLayout>
    );
}
