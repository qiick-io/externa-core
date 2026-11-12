import { Head, router, useForm, usePage } from '@inertiajs/react';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, Copy, KeyRound, TriangleAlert, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable } from '@/components/admin/data-table';
import { HeaderIconButton } from '@/components/admin/header-icon-button';
import { PageEmptyState } from '@/components/admin/page-empty-state';
import { ConfirmDestructiveDialog } from '@/components/confirm-destructive-dialog';
import Heading from '@/components/heading';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Field,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
    InputGroup,
    InputGroupAddon,
    InputGroupButton,
    InputGroupInput,
} from '@/components/ui/input-group';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useClipboard } from '@/hooks/use-clipboard';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { normalizePaginated } from '@/lib/pagination';
import type { LaravelPaginated } from '@/lib/pagination';
import apiKeysRoutes from '@/routes/api-keys';
import { edit as editProfile } from '@/routes/profile';
import type { BreadcrumbItem, Paginated } from '@/types';

type ApiKeyRow = {
    id: number;
    name: string;
    key_prefix: string;
    role?: { id: number; name: string } | null;
    owner_id?: number | null;
    owner?: { id: number; name: string; email: string } | null;
    collection_slugs?: string[] | null;
    read_only?: boolean;
    files_scope?: 'none' | 'read' | 'all';
    ip_allowlist?: string[] | null;
    rate_limit_per_minute?: number | null;
    expires_at?: string | null;
    last_used_at?: string | null;
    revoked_at?: string | null;
    created_at?: string;
};

type RoleOption = {
    id: number;
    name: string;
};

type OwnerOption = {
    id: number;
    name: string;
    email: string;
};

/**
 * List project API keys; creation opens from a header primary button Dialog.
 */
export default function AdminApiKeysIndex({
    apiKeys: apiKeysProp,
    roles,
    owners,
    currentUserId,
    plainTextKey,
}: {
    apiKeys: LaravelPaginated<ApiKeyRow> | Paginated<ApiKeyRow>;
    roles: RoleOption[];
    owners: OwnerOption[];
    currentUserId?: number | null;
    plainTextKey?: string | null;
}) {
    const { t } = useTranslation();
    const page = usePage();
    const flashKey =
        plainTextKey ??
        (typeof page.props.flash === 'object' &&
        page.props.flash &&
        'plain_text_api_key' in page.props.flash
            ? String(
                  (page.props.flash as { plain_text_api_key?: string })
                      .plain_text_api_key ?? '',
              )
            : '');
    const secretKey = plainTextKey || flashKey;
    const [copiedSecret, copySecret] = useClipboard();

    const apiKeys = normalizePaginated(apiKeysProp);
    const rows = apiKeys.data ?? [];

    const [createOpen, setCreateOpen] = useState(false);
    const [ipText, setIpText] = useState('');
    const [collectionSlugsText, setCollectionSlugsText] = useState('');
    const [filesScopeTouched, setFilesScopeTouched] = useState(false);
    const [pendingRevokeKeyId, setPendingRevokeKeyId] = useState<number | null>(
        null,
    );
    const [revoking, setRevoking] = useState(false);

    const defaultFilesScope = (
        slugsText: string,
        readOnly: boolean,
    ): 'none' | 'read' | 'all' => {
        const scoped =
            slugsText
                .split(/[\s,]+/)
                .map((s) => s.trim())
                .filter(Boolean).length > 0;

        if (scoped) {
            return 'none';
        }

        return readOnly ? 'read' : 'all';
    };

    const defaultOwnerId =
        currentUserId != null
            ? String(currentUserId)
            : owners[0]
              ? String(owners[0].id)
              : '';

    const form = useForm({
        name: '',
        role_id: roles[0] ? String(roles[0].id) : '',
        owner_id: defaultOwnerId,
        collection_slugs: '' as string,
        read_only: false,
        files_scope: 'all' as 'none' | 'read' | 'all',
        ip_allowlist: '' as string,
        rate_limit_per_minute: '' as string,
        expires_at: '' as string,
    });

    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: t('settings.layout.title'),
            href: editProfile(),
        },
        {
            title: t('settings.layout.apiKeys'),
            href: apiKeysRoutes.index.url(),
        },
    ];

    const resetCreateForm = (): void => {
        form.reset();
        form.clearErrors();
        form.setData('owner_id', defaultOwnerId);
        form.setData('files_scope', 'all');
        setIpText('');
        setCollectionSlugsText('');
        setFilesScopeTouched(false);
    };

    const submit = (e: React.FormEvent): void => {
        e.preventDefault();
        form.transform((data) => ({
            name: data.name,
            role_id: Number(data.role_id),
            owner_id: data.owner_id ? Number(data.owner_id) : null,
            collection_slugs: collectionSlugsText,
            read_only: data.read_only,
            files_scope: data.files_scope,
            ip_allowlist: ipText,
            rate_limit_per_minute: data.rate_limit_per_minute
                ? Number(data.rate_limit_per_minute)
                : null,
            expires_at: data.expires_at || null,
        }));
        form.post(apiKeysRoutes.store.url(), {
            preserveScroll: true,
            onSuccess: () => {
                resetCreateForm();
                setCreateOpen(false);
            },
        });
    };

    const columns: ColumnDef<ApiKeyRow>[] = [
        {
            id: 'name',
            header: t('settings.apiKeys.columns.name'),
            meta: { cellClassName: 'font-medium' },
            cell: ({ row }) => row.original.name,
        },
        {
            id: 'prefix',
            header: t('settings.apiKeys.columns.prefix'),
            meta: { cellClassName: 'font-mono text-xs' },
            cell: ({ row }) => `${row.original.key_prefix}…`,
        },
        {
            id: 'role',
            header: t('settings.apiKeys.columns.role'),
            cell: ({ row }) => row.original.role?.name ?? '—',
        },
        {
            id: 'owner',
            header: t('settings.apiKeys.owner'),
            cell: ({ row }) => row.original.owner?.name ?? '—',
        },
        {
            id: 'scopes',
            header: t('settings.apiKeys.scopes'),
            meta: { cellClassName: 'text-xs text-muted-foreground' },
            cell: ({ row }) => {
                const key = row.original;

                return (
                    [
                        key.read_only
                            ? t('settings.apiKeys.readOnlyBadge')
                            : null,
                        key.files_scope && key.files_scope !== 'all'
                            ? `files:${key.files_scope}`
                            : null,
                        key.collection_slugs?.length
                            ? key.collection_slugs.join(', ')
                            : null,
                    ]
                        .filter(Boolean)
                        .join(' · ') || '—'
                );
            },
        },
        {
            id: 'status',
            header: t('settings.apiKeys.columns.status'),
            cell: ({ row }) =>
                row.original.revoked_at ? (
                    <Badge variant="muted">
                        {t('settings.apiKeys.status.revoked')}
                    </Badge>
                ) : (
                    <Badge variant="success">
                        {t('settings.apiKeys.status.active')}
                    </Badge>
                ),
        },
        {
            id: 'actions',
            header: t('settings.apiKeys.columns.actions'),
            meta: {
                headerClassName: 'w-[1%] text-right',
                cellClassName: 'text-right',
            },
            cell: ({ row }) =>
                row.original.revoked_at ? null : (
                    <HeaderIconButton
                        type="button"
                        variant="destructive-ghost"
                        size="icon-sm"
                        label={t('settings.apiKeys.revoke')}
                        onClick={() => setPendingRevokeKeyId(row.original.id)}
                    >
                        <Trash2 className="size-3.5" />
                    </HeaderIconButton>
                ),
        },
    ];

    return (
        <AppLayout
            breadcrumbs={breadcrumbs}
            headerActions={
                <Button
                    type="button"
                    data-testid="api-key-create-open"
                    onClick={() => setCreateOpen(true)}
                >
                    <KeyRound className="mr-1 size-4" />
                    {t('settings.apiKeys.create')}
                </Button>
            }
        >
            <Head title={t('settings.layout.apiKeys')} />

            <SettingsLayout wide>
                <div className="flex min-h-0 flex-1 flex-col gap-6">
                    <div className="flex w-full flex-col gap-6">
                        <Heading
                            variant="small"
                            title={t('settings.layout.apiKeys')}
                            description={t('settings.apiKeys.description')}
                        />

                        {secretKey && (
                            <Alert
                                variant="warning"
                                data-testid="api-key-secret"
                            >
                                <TriangleAlert />
                                <AlertTitle>
                                    {t('settings.apiKeys.secretBanner')}
                                </AlertTitle>
                                <AlertDescription>
                                    <InputGroup className="mt-1 w-full bg-background">
                                        <InputGroupInput
                                            readOnly
                                            data-testid="api-key-secret-value"
                                            aria-label={t(
                                                'settings.apiKeys.secretValue',
                                            )}
                                            value={secretKey}
                                            className="font-mono text-foreground"
                                        />
                                        <InputGroupAddon align="inline-end">
                                            <InputGroupButton
                                                size="icon-xs"
                                                aria-label={
                                                    copiedSecret === secretKey
                                                        ? t('common.copied')
                                                        : t('common.copy')
                                                }
                                                onClick={() =>
                                                    void copySecret(secretKey)
                                                }
                                            >
                                                {copiedSecret === secretKey ? (
                                                    <Check />
                                                ) : (
                                                    <Copy />
                                                )}
                                            </InputGroupButton>
                                        </InputGroupAddon>
                                    </InputGroup>
                                </AlertDescription>
                            </Alert>
                        )}

                        {rows.length === 0 ? (
                            <PageEmptyState
                                icon={KeyRound}
                                title={t('emptyState.apiKeys.title')}
                                description={t(
                                    'emptyState.apiKeys.description',
                                )}
                                action={
                                    <Button
                                        type="button"
                                        onClick={() => setCreateOpen(true)}
                                    >
                                        <KeyRound className="size-4" />
                                        {t('emptyState.apiKeys.cta')}
                                    </Button>
                                }
                                docsHref="https://docs.qiick.io/externa"
                                docsLabel={t('common.learnMore')}
                                compact
                            />
                        ) : (
                            <DataTable
                                columns={columns}
                                data={rows}
                                getRowId={(key) => String(key.id)}
                                pagination={apiKeys}
                            />
                        )}
                    </div>
                </div>
            </SettingsLayout>

            <Dialog
                open={createOpen}
                onOpenChange={(open) => {
                    if (open) {
                        setCreateOpen(true);

                        return;
                    }

                    if (form.processing) {
                        return;
                    }

                    setCreateOpen(false);
                }}
            >
                <DialogContent
                    className="sm:max-w-2xl"
                    data-testid="api-key-create-dialog"
                >
                    <DialogHeader>
                        <DialogTitle>
                            {t('settings.apiKeys.createTitle')}
                        </DialogTitle>
                        <DialogDescription>
                            {t('settings.apiKeys.createDescription')}
                        </DialogDescription>
                    </DialogHeader>

                    <form
                        id="api-key-create-form"
                        onSubmit={submit}
                        noValidate
                        className="max-h-[min(70vh,36rem)] overflow-y-auto"
                    >
                        <FieldGroup className="grid gap-4 md:grid-cols-2">
                            <Field
                                data-invalid={
                                    form.errors.name ? true : undefined
                                }
                            >
                                <FieldLabel htmlFor="api_key_name">
                                    {t('settings.apiKeys.columns.name')}
                                </FieldLabel>
                                <Input
                                    id="api_key_name"
                                    value={form.data.name}
                                    onChange={(e) =>
                                        form.setData('name', e.target.value)
                                    }
                                    required
                                    aria-invalid={
                                        form.errors.name ? true : undefined
                                    }
                                    aria-describedby={
                                        form.errors.name
                                            ? 'api-key-name-error'
                                            : undefined
                                    }
                                />
                                <FieldError id="api-key-name-error">
                                    {form.errors.name}
                                </FieldError>
                            </Field>
                            <Field
                                data-invalid={
                                    form.errors.role_id ? true : undefined
                                }
                            >
                                <FieldLabel>
                                    {t('settings.apiKeys.columns.role')}
                                </FieldLabel>
                                <Select
                                    value={form.data.role_id}
                                    onValueChange={(v) =>
                                        form.setData('role_id', v)
                                    }
                                >
                                    <SelectTrigger
                                        aria-invalid={
                                            form.errors.role_id
                                                ? true
                                                : undefined
                                        }
                                        aria-describedby={
                                            form.errors.role_id
                                                ? 'api-key-role-error'
                                                : undefined
                                        }
                                    >
                                        <SelectValue
                                            placeholder={t(
                                                'settings.apiKeys.selectRole',
                                            )}
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {roles.map((role) => (
                                            <SelectItem
                                                key={role.id}
                                                value={String(role.id)}
                                            >
                                                {role.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FieldError id="api-key-role-error">
                                    {form.errors.role_id}
                                </FieldError>
                            </Field>
                            <Field
                                data-invalid={
                                    form.errors.owner_id ? true : undefined
                                }
                            >
                                <FieldLabel>
                                    {t('settings.apiKeys.owner')}
                                </FieldLabel>
                                <Select
                                    value={form.data.owner_id}
                                    onValueChange={(v) =>
                                        form.setData('owner_id', v)
                                    }
                                >
                                    <SelectTrigger
                                        aria-invalid={
                                            form.errors.owner_id
                                                ? true
                                                : undefined
                                        }
                                        aria-describedby={
                                            form.errors.owner_id
                                                ? 'api-key-owner-error'
                                                : 'api-key-owner-hint'
                                        }
                                    >
                                        <SelectValue
                                            placeholder={t(
                                                'settings.apiKeys.owner',
                                            )}
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {owners.map((owner) => (
                                            <SelectItem
                                                key={owner.id}
                                                value={String(owner.id)}
                                            >
                                                {owner.name} ({owner.email})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FieldDescription id="api-key-owner-hint">
                                    {t('settings.apiKeys.ownerHelp')}
                                </FieldDescription>
                                <FieldError id="api-key-owner-error">
                                    {form.errors.owner_id}
                                </FieldError>
                            </Field>
                            <Field
                                className="md:col-span-2"
                                data-invalid={
                                    form.errors.collection_slugs
                                        ? true
                                        : undefined
                                }
                            >
                                <FieldLabel htmlFor="collection_slugs">
                                    {t('settings.apiKeys.collectionSlugs')}
                                </FieldLabel>
                                <Input
                                    id="collection_slugs"
                                    value={collectionSlugsText}
                                    onChange={(e) => {
                                        const next = e.target.value;
                                        setCollectionSlugsText(next);

                                        if (!filesScopeTouched) {
                                            form.setData(
                                                'files_scope',
                                                defaultFilesScope(
                                                    next,
                                                    form.data.read_only,
                                                ),
                                            );
                                        }
                                    }}
                                    placeholder="posts, pages"
                                    aria-invalid={
                                        form.errors.collection_slugs
                                            ? true
                                            : undefined
                                    }
                                    aria-describedby={
                                        form.errors.collection_slugs
                                            ? 'api-key-collection-slugs-error'
                                            : 'api-key-collection-slugs-hint'
                                    }
                                />
                                <FieldDescription id="api-key-collection-slugs-hint">
                                    {t('settings.apiKeys.collectionSlugsHelp')}
                                </FieldDescription>
                                <FieldError id="api-key-collection-slugs-error">
                                    {form.errors.collection_slugs}
                                </FieldError>
                            </Field>
                            <Field
                                className="md:col-span-2"
                                data-invalid={
                                    form.errors.read_only ? true : undefined
                                }
                            >
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id="read_only"
                                        checked={form.data.read_only}
                                        onCheckedChange={(checked) => {
                                            const readOnly = checked === true;
                                            form.setData('read_only', readOnly);

                                            if (!filesScopeTouched) {
                                                form.setData(
                                                    'files_scope',
                                                    defaultFilesScope(
                                                        collectionSlugsText,
                                                        readOnly,
                                                    ),
                                                );
                                            }
                                        }}
                                    />
                                    <FieldLabel
                                        htmlFor="read_only"
                                        className="font-normal"
                                    >
                                        {t('settings.apiKeys.readOnly')}
                                    </FieldLabel>
                                </div>
                                <FieldError id="api-key-read-only-error">
                                    {form.errors.read_only}
                                </FieldError>
                            </Field>
                            <Field
                                className="md:col-span-2"
                                data-invalid={
                                    form.errors.files_scope ? true : undefined
                                }
                            >
                                <FieldLabel htmlFor="files_scope">
                                    {t('settings.apiKeys.filesScope')}
                                </FieldLabel>
                                <Select
                                    value={form.data.files_scope}
                                    onValueChange={(value) => {
                                        setFilesScopeTouched(true);
                                        form.setData(
                                            'files_scope',
                                            value as 'none' | 'read' | 'all',
                                        );
                                    }}
                                >
                                    <SelectTrigger
                                        id="files_scope"
                                        aria-invalid={
                                            form.errors.files_scope
                                                ? true
                                                : undefined
                                        }
                                        aria-describedby={
                                            form.errors.files_scope
                                                ? 'api-key-files-scope-error'
                                                : 'api-key-files-scope-hint'
                                        }
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">
                                            {t(
                                                'settings.apiKeys.filesScopeNone',
                                            )}
                                        </SelectItem>
                                        <SelectItem value="read">
                                            {t(
                                                'settings.apiKeys.filesScopeRead',
                                            )}
                                        </SelectItem>
                                        <SelectItem value="all">
                                            {t(
                                                'settings.apiKeys.filesScopeAll',
                                            )}
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                                <FieldDescription id="api-key-files-scope-hint">
                                    {t('settings.apiKeys.filesScopeHelp')}
                                </FieldDescription>
                                <FieldError id="api-key-files-scope-error">
                                    {form.errors.files_scope}
                                </FieldError>
                            </Field>
                            <Field
                                className="md:col-span-2"
                                data-invalid={
                                    form.errors.ip_allowlist ? true : undefined
                                }
                            >
                                <FieldLabel htmlFor="ip_allowlist">
                                    {t('settings.apiKeys.ipAllowlist')}
                                </FieldLabel>
                                <Input
                                    id="ip_allowlist"
                                    value={ipText}
                                    onChange={(e) => setIpText(e.target.value)}
                                    placeholder="127.0.0.1, 10.0.0.0/8"
                                    aria-invalid={
                                        form.errors.ip_allowlist
                                            ? true
                                            : undefined
                                    }
                                    aria-describedby={
                                        form.errors.ip_allowlist
                                            ? 'api-key-ip-allowlist-error'
                                            : undefined
                                    }
                                />
                                <FieldError id="api-key-ip-allowlist-error">
                                    {form.errors.ip_allowlist}
                                </FieldError>
                            </Field>
                            <Field
                                data-invalid={
                                    form.errors.rate_limit_per_minute
                                        ? true
                                        : undefined
                                }
                            >
                                <FieldLabel htmlFor="rate_limit">
                                    {t('settings.apiKeys.rateLimit')}
                                </FieldLabel>
                                <Input
                                    id="rate_limit"
                                    type="number"
                                    min={1}
                                    value={form.data.rate_limit_per_minute}
                                    onChange={(e) =>
                                        form.setData(
                                            'rate_limit_per_minute',
                                            e.target.value,
                                        )
                                    }
                                    aria-invalid={
                                        form.errors.rate_limit_per_minute
                                            ? true
                                            : undefined
                                    }
                                    aria-describedby={
                                        form.errors.rate_limit_per_minute
                                            ? 'api-key-rate-limit-error'
                                            : undefined
                                    }
                                    className="w-auto max-w-[13rem]"
                                />
                                <FieldError id="api-key-rate-limit-error">
                                    {form.errors.rate_limit_per_minute}
                                </FieldError>
                            </Field>
                            <Field
                                data-invalid={
                                    form.errors.expires_at ? true : undefined
                                }
                            >
                                <FieldLabel htmlFor="expires_at">
                                    {t('settings.apiKeys.expiresAt')}
                                </FieldLabel>
                                <Input
                                    id="expires_at"
                                    type="datetime-local"
                                    value={form.data.expires_at}
                                    onChange={(e) =>
                                        form.setData(
                                            'expires_at',
                                            e.target.value,
                                        )
                                    }
                                    aria-invalid={
                                        form.errors.expires_at
                                            ? true
                                            : undefined
                                    }
                                    aria-describedby={
                                        form.errors.expires_at
                                            ? 'api-key-expires-at-error'
                                            : undefined
                                    }
                                    className="w-auto max-w-[16rem]"
                                />
                                <FieldError id="api-key-expires-at-error">
                                    {form.errors.expires_at}
                                </FieldError>
                            </Field>
                        </FieldGroup>
                    </form>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={form.processing}
                            onClick={() => setCreateOpen(false)}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button
                            type="submit"
                            form="api-key-create-form"
                            disabled={form.processing}
                            data-testid="api-key-create-submit"
                        >
                            <KeyRound className="mr-2 size-4" />
                            {t('settings.apiKeys.create')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ConfirmDestructiveDialog
                open={pendingRevokeKeyId !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setPendingRevokeKeyId(null);
                    }
                }}
                title={t('settings.apiKeys.confirm.revokeTitle', {
                    name:
                        rows.find((key) => key.id === pendingRevokeKeyId)
                            ?.name ?? '',
                })}
                description={t('settings.apiKeys.confirm.revokeDescription')}
                confirmLabel={t('settings.apiKeys.confirm.revokeConfirm')}
                confirming={revoking}
                onConfirm={() => {
                    if (pendingRevokeKeyId === null) {
                        return;
                    }

                    setRevoking(true);
                    router.delete(
                        apiKeysRoutes.destroy.url(pendingRevokeKeyId),
                        {
                            onFinish: () => setRevoking(false),
                            onSuccess: () => setPendingRevokeKeyId(null),
                            onError: () => setPendingRevokeKeyId(null),
                        },
                    );
                }}
            />
        </AppLayout>
    );
}
