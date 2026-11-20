import { Head, useForm } from '@inertiajs/react';
import { ShieldAlert } from 'lucide-react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Field,
    FieldContent,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
    FieldLegend,
    FieldSet,
} from '@/components/ui/field';
import { NativeSelect } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import AuthLayout from '@/layouts/auth-layout';
import { approve, deny } from '@/routes/passport/authorizations';

type OfferedScope = {
    value: string;
    isGrantable: boolean;
};

type GrantableRole = {
    id: number;
    name: string;
};

type ReadableCollection = {
    slug: string;
    name: string;
};

type Props = {
    authToken: string;
    client: { id: string; name: string; redirectHost: string };
    scopes: OfferedScope[];
    roles: GrantableRole[];
    collections: ReadableCollection[];
    canGrant: boolean;
};

/**
 * i18next reads `:` as its namespace separator, so scope values cannot be translation keys.
 */
function scopeDescriptionKey(scopeValue: string): string {
    const [resource, action] = scopeValue.split(':');

    return `oauth.authorize.scopeDescriptions.${resource}${action === 'write' ? 'Write' : 'Read'}`;
}

type ConsentForm = {
    auth_token: string;
    scopes: string[];
    role_id: number | '';
    all_collections: boolean;
    collection_slugs: string[];
};

/**
 * OAuth consent for a remote MCP client (#802), on the auth-card pattern of the login pages.
 *
 * The screen narrows what the client gets: mcp:read is pre-selected (least privilege); the role
 * it acts with; and an explicit collection choice (all collections, or one or more slugs — empty
 * is refused). The client name is the client's own claim, so the host the approval returns to is
 * always shown next to it. The server re-checks every choice.
 *
 * ponytail: plain controls on the auth card; the consent screen's polish (scope groups, a
 * collection picker for long lists) is deferred in #802.
 */
export default function OAuthAuthorize({
    authToken,
    client,
    scopes,
    roles,
    collections,
    canGrant,
}: Props) {
    const { t } = useTranslation();
    const approval = useForm<ConsentForm>({
        auth_token: authToken,
        // Least privilege: only mcp:read is pre-ticked; the user opts into writes.
        scopes: scopes
            .filter((scope) => scope.isGrantable && scope.value === 'mcp:read')
            .map((scope) => scope.value),
        role_id: roles.length === 1 ? roles[0].id : '',
        all_collections: false,
        collection_slugs: [],
    });
    const denial = useForm({ auth_token: authToken });
    const isBusy = approval.processing || denial.processing;

    const toggleScope = (scopeValue: string, isChecked: boolean): void => {
        approval.setData(
            'scopes',
            isChecked
                ? [...approval.data.scopes, scopeValue]
                : approval.data.scopes.filter((value) => value !== scopeValue),
        );
    };

    const toggleCollection = (slug: string, isChecked: boolean): void => {
        approval.setData(
            'collection_slugs',
            isChecked
                ? [...approval.data.collection_slugs, slug]
                : approval.data.collection_slugs.filter(
                      (value) => value !== slug,
                  ),
        );
    };

    const submitApproval = (event: FormEvent<HTMLFormElement>): void => {
        event.preventDefault();
        approval.submit(approve());
    };

    const submitDenial = (): void => {
        denial.submit(deny());
    };

    const scopesError =
        approval.errors.scopes ??
        Object.entries(approval.errors).find(([field]) =>
            field.startsWith('scopes.'),
        )?.[1];
    const collectionsError = Object.entries(approval.errors).find(([field]) =>
        field.startsWith('collection_slugs'),
    )?.[1];

    return (
        <AuthLayout
            title={t('oauth.authorize.title', { client: client.name })}
            description={t('oauth.authorize.description', {
                host: client.redirectHost,
            })}
        >
            <Head title={t('oauth.authorize.head')} />

            <Alert variant="warning" className="mb-6">
                <ShieldAlert aria-hidden="true" />
                <AlertDescription data-test="oauth-redirect-host">
                    {t('oauth.authorize.redirectWarning', {
                        host: client.redirectHost,
                    })}
                </AlertDescription>
            </Alert>

            {!canGrant && (
                <Alert variant="destructive" className="mb-6" role="status">
                    <AlertDescription data-test="oauth-cannot-grant">
                        {t('oauth.authorize.cannotGrant')}
                    </AlertDescription>
                </Alert>
            )}

            <form onSubmit={submitApproval} noValidate>
                <FieldGroup className="gap-6">
                    {canGrant && (
                        <>
                            <FieldSet
                                data-invalid={scopesError ? true : undefined}
                            >
                                <FieldLegend variant="label">
                                    {t('oauth.authorize.scopesLegend')}
                                </FieldLegend>
                                {scopes.map((scope) => (
                                    <Field
                                        key={scope.value}
                                        orientation="horizontal"
                                        data-test={`oauth-scope-${scope.value}`}
                                    >
                                        <Checkbox
                                            id={`scope-${scope.value}`}
                                            checked={approval.data.scopes.includes(
                                                scope.value,
                                            )}
                                            disabled={!scope.isGrantable}
                                            onCheckedChange={(value) =>
                                                toggleScope(
                                                    scope.value,
                                                    value === true,
                                                )
                                            }
                                        />
                                        <FieldContent>
                                            <FieldLabel
                                                htmlFor={`scope-${scope.value}`}
                                            >
                                                <code>{scope.value}</code>
                                            </FieldLabel>
                                            <FieldDescription>
                                                {scope.isGrantable
                                                    ? t(
                                                          scopeDescriptionKey(
                                                              scope.value,
                                                          ),
                                                      )
                                                    : t(
                                                          'oauth.authorize.scopeNotHeld',
                                                      )}
                                            </FieldDescription>
                                        </FieldContent>
                                    </Field>
                                ))}
                                <FieldError>{scopesError}</FieldError>
                            </FieldSet>

                            <Field
                                data-invalid={
                                    approval.errors.role_id ? true : undefined
                                }
                            >
                                <FieldLabel htmlFor="role_id">
                                    {t('oauth.authorize.roleLabel')}
                                </FieldLabel>
                                <NativeSelect
                                    id="role_id"
                                    value={String(approval.data.role_id)}
                                    onChange={(event) =>
                                        approval.setData(
                                            'role_id',
                                            event.target.value === ''
                                                ? ''
                                                : Number(event.target.value),
                                        )
                                    }
                                    aria-invalid={
                                        approval.errors.role_id
                                            ? true
                                            : undefined
                                    }
                                    data-test="oauth-role"
                                >
                                    <option value="">
                                        {t('oauth.authorize.rolePlaceholder')}
                                    </option>
                                    {roles.map((role) => (
                                        <option key={role.id} value={role.id}>
                                            {role.name}
                                        </option>
                                    ))}
                                </NativeSelect>
                                <FieldDescription>
                                    {t('oauth.authorize.roleDescription')}
                                </FieldDescription>
                                <FieldError>
                                    {approval.errors.role_id}
                                </FieldError>
                            </Field>

                            {collections.length > 0 && (
                                <FieldSet
                                    data-invalid={
                                        collectionsError ? true : undefined
                                    }
                                >
                                    <FieldLegend variant="label">
                                        {t('oauth.authorize.collectionsLegend')}
                                    </FieldLegend>
                                    <FieldDescription>
                                        {t(
                                            'oauth.authorize.collectionsDescription',
                                        )}
                                    </FieldDescription>
                                    <Field orientation="horizontal">
                                        <Checkbox
                                            id="all-collections"
                                            checked={
                                                approval.data.all_collections
                                            }
                                            onCheckedChange={(value) => {
                                                const isAll = value === true;
                                                approval.setData({
                                                    ...approval.data,
                                                    all_collections: isAll,
                                                    collection_slugs: isAll
                                                        ? []
                                                        : approval.data
                                                              .collection_slugs,
                                                });
                                            }}
                                            data-test="oauth-all-collections"
                                        />
                                        <FieldLabel htmlFor="all-collections">
                                            {t(
                                                'oauth.authorize.allCollections',
                                            )}
                                        </FieldLabel>
                                    </Field>
                                    {!approval.data.all_collections &&
                                        collections.map((collection) => (
                                            <Field
                                                key={collection.slug}
                                                orientation="horizontal"
                                            >
                                                <Checkbox
                                                    id={`collection-${collection.slug}`}
                                                    checked={approval.data.collection_slugs.includes(
                                                        collection.slug,
                                                    )}
                                                    onCheckedChange={(value) =>
                                                        toggleCollection(
                                                            collection.slug,
                                                            value === true,
                                                        )
                                                    }
                                                />
                                                <FieldLabel
                                                    htmlFor={`collection-${collection.slug}`}
                                                >
                                                    {collection.name}
                                                </FieldLabel>
                                            </Field>
                                        ))}
                                    <FieldError>{collectionsError}</FieldError>
                                </FieldSet>
                            )}
                        </>
                    )}

                    <div className="flex flex-col gap-3">
                        {canGrant && (
                            <Button
                                type="submit"
                                className="w-full"
                                disabled={isBusy}
                                data-test="oauth-approve"
                            >
                                {approval.processing && <Spinner />}
                                {t('oauth.authorize.approve')}
                            </Button>
                        )}
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full"
                            disabled={isBusy}
                            onClick={submitDenial}
                            data-test="oauth-deny"
                        >
                            {denial.processing && <Spinner />}
                            {t('oauth.authorize.deny')}
                        </Button>
                    </div>
                </FieldGroup>
            </form>
        </AuthLayout>
    );
}
