import { Head, router, useForm, usePage } from '@inertiajs/react';
import { KeyRound, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDestructiveDialog } from '@/components/confirm-destructive-dialog';
import { TablePagination } from '@/components/layout/page-layout';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Field,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import adminRoutes from '@/lib/admin-routes';
import { normalizePaginated } from '@/lib/pagination';
import type { LaravelPaginated } from '@/lib/pagination';
import type { BreadcrumbItem, Paginated } from '@/types';
import { edit as editProfile } from '@/routes/profile';

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
 * List and create project API keys for the public CMS API.
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

    const apiKeys = normalizePaginated(apiKeysProp);
    const rows = apiKeys.data ?? [];

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
            href: adminRoutes.apiKeys.index(),
        },
    ];

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
        form.post(adminRoutes.apiKeys.store(), {
            preserveScroll: true,
            onSuccess: () => {
                form.reset();
                form.setData('owner_id', defaultOwnerId);
                form.setData('files_scope', 'all');
                setIpText('');
                setCollectionSlugsText('');
                setFilesScopeTouched(false);
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('settings.layout.apiKeys')} />

            <SettingsLayout wide>
                <div className="flex min-h-0 flex-1 flex-col gap-6">
                    <div className="flex w-full flex-col gap-6">
                        <div>
                            <h1 className="text-xl font-semibold tracking-tight">
                                {t('settings.layout.apiKeys')}
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                Bearer tokens for{' '}
                                <code className="text-xs">/api/v1</code>.
                                Permissions come from the selected role (use
                                Public for anonymous-equivalent access).
                            </p>
                        </div>

                        {(flashKey || plainTextKey) && (
                            <div
                                data-testid="api-key-secret"
                                className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-warning"
                            >
                                <p className="font-medium">
                                    Copy this key now — it will not be shown
                                    again.
                                </p>
                                <code
                                    data-testid="api-key-secret-value"
                                    className="mt-2 block font-mono text-xs break-all"
                                >
                                    {plainTextKey || flashKey}
                                </code>
                            </div>
                        )}

                        <form
                            onSubmit={submit}
                            noValidate
                            className="rounded-xl border border-sidebar-border/70 p-4 dark:border-sidebar-border"
                        >
                            <FieldGroup className="grid gap-4 md:grid-cols-2">
                                <Field
                                    data-invalid={
                                        form.errors.name ? true : undefined
                                    }
                                >
                                    <FieldLabel htmlFor="api_key_name">
                                        Name
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
                                    <FieldLabel>Role</FieldLabel>
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
                                            <SelectValue placeholder="Select role" />
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
                                        {t(
                                            'settings.apiKeys.collectionSlugsHelp',
                                        )}
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
                                                const readOnly =
                                                    checked === true;
                                                form.setData(
                                                    'read_only',
                                                    readOnly,
                                                );

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
                                        form.errors.files_scope
                                            ? true
                                            : undefined
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
                                                value as
                                                    'none' | 'read' | 'all',
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
                                        form.errors.ip_allowlist
                                            ? true
                                            : undefined
                                    }
                                >
                                    <FieldLabel htmlFor="ip_allowlist">
                                        IP allowlist (optional, comma-separated)
                                    </FieldLabel>
                                    <Input
                                        id="ip_allowlist"
                                        value={ipText}
                                        onChange={(e) =>
                                            setIpText(e.target.value)
                                        }
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
                                        Rate limit / minute (optional)
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
                                    />
                                    <FieldError id="api-key-rate-limit-error">
                                        {form.errors.rate_limit_per_minute}
                                    </FieldError>
                                </Field>
                                <Field
                                    data-invalid={
                                        form.errors.expires_at
                                            ? true
                                            : undefined
                                    }
                                >
                                    <FieldLabel htmlFor="expires_at">
                                        Expires at
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
                                    />
                                    <FieldError id="api-key-expires-at-error">
                                        {form.errors.expires_at}
                                    </FieldError>
                                </Field>
                                <div className="md:col-span-2">
                                    <Button
                                        type="submit"
                                        disabled={form.processing}
                                    >
                                        <KeyRound className="mr-2 size-4" />
                                        Create API key
                                    </Button>
                                </div>
                            </FieldGroup>
                        </form>

                        <div className="overflow-hidden rounded-xl border border-sidebar-border/70 dark:border-sidebar-border">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-muted/40">
                                            <th className="px-3 py-2 text-left">
                                                Name
                                            </th>
                                            <th className="px-3 py-2 text-left">
                                                Prefix
                                            </th>
                                            <th className="px-3 py-2 text-left">
                                                Role
                                            </th>
                                            <th className="px-3 py-2 text-left">
                                                {t('settings.apiKeys.owner')}
                                            </th>
                                            <th className="px-3 py-2 text-left">
                                                {t('settings.apiKeys.scopes')}
                                            </th>
                                            <th className="px-3 py-2 text-left">
                                                Status
                                            </th>
                                            <th className="px-3 py-2 text-right">
                                                Actions
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.length === 0 ? (
                                            <tr>
                                                <td
                                                    colSpan={7}
                                                    className="px-3 py-6 text-center text-muted-foreground"
                                                >
                                                    No API keys yet.
                                                </td>
                                            </tr>
                                        ) : (
                                            rows.map((key) => (
                                                <tr
                                                    key={key.id}
                                                    className="border-b last:border-0"
                                                >
                                                    <td className="px-3 py-2 font-medium">
                                                        {key.name}
                                                    </td>
                                                    <td className="px-3 py-2 font-mono text-xs">
                                                        {key.key_prefix}…
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        {key.role?.name ?? '—'}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        {key.owner?.name ?? '—'}
                                                    </td>
                                                    <td className="px-3 py-2 text-xs text-muted-foreground">
                                                        {[
                                                            key.read_only
                                                                ? t(
                                                                      'settings.apiKeys.readOnlyBadge',
                                                                  )
                                                                : null,
                                                            key.files_scope &&
                                                            key.files_scope !==
                                                                'all'
                                                                ? `files:${key.files_scope}`
                                                                : null,
                                                            key.collection_slugs
                                                                ?.length
                                                                ? key.collection_slugs.join(
                                                                      ', ',
                                                                  )
                                                                : null,
                                                        ]
                                                            .filter(Boolean)
                                                            .join(' · ') || '—'}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        {key.revoked_at
                                                            ? 'Revoked'
                                                            : 'Active'}
                                                    </td>
                                                    <td className="px-3 py-2 text-right">
                                                        {!key.revoked_at && (
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() =>
                                                                    setPendingRevokeKeyId(
                                                                        key.id,
                                                                    )
                                                                }
                                                            >
                                                                <Trash2 className="size-4" />
                                                            </Button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            {apiKeys.last_page > 1 ? (
                                <div className="flex justify-center border-t border-sidebar-border/70 px-4 py-3 dark:border-sidebar-border">
                                    <TablePagination
                                        links={apiKeys.links ?? []}
                                    />
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            </SettingsLayout>

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
                        adminRoutes.apiKeys.destroy(pendingRevokeKeyId),
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
