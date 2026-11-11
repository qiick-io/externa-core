import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ContentCollectionController from '@/actions/App/Http/Controllers/Collections/ContentCollectionController';
import { LucideIconPicker } from '@/components/collections/field-settings/lucide-icon-picker';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    DrawerBody,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
} from '@/components/ui/drawer';
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
import { Textarea } from '@/components/ui/textarea';
import type { UseCollectionsReturn } from '@/hooks/use-collections';
import { jsonRequestHeaders } from '@/lib/csrf';
import { COLLECTION_SLUG_PATTERN, slugify, slugifyInput } from '@/lib/slugify';
import {
    COLLECTION_COLOR_PICKER_FALLBACK,
    resolveCollectionColor,
} from '@/types/collections';
import type { CollectionRow } from '@/types/collections';

export type CollectionFormDrawerProps = {
    editing: CollectionRow | null;
    slugManual: boolean;
    setSlugManual: (manual: boolean) => void;
    form: UseCollectionsReturn['form'];
    title: string;
    submit: () => void;
    /** Prefer over DrawerClose so leave goes through requestLeave. */
    onCancel: () => void;
};

/**
 * Drawer for creating and editing collections.
 * @param {*} props - Component props.
 * @returns {JSX.Element}
 */
export function CollectionFormDrawer({
    editing,
    slugManual,
    setSlugManual,
    form,
    title,
    submit,
    onCancel,
}: CollectionFormDrawerProps) {
    const { t } = useTranslation();
    const [debouncedSlugError, setDebouncedSlugError] = useState<
        string | undefined
    >();

    useEffect(() => {
        const controller = new AbortController();

        const handle = window.setTimeout(() => {
            // Trailing `-` while typing → compare the finalized slug.
            const key = COLLECTION_SLUG_PATTERN.test(form.data.slug)
                ? form.data.slug
                : slugify(form.data.slug);

            if (key === '') {
                setDebouncedSlugError(undefined);

                return;
            }

            if (!COLLECTION_SLUG_PATTERN.test(key)) {
                setDebouncedSlugError(t('collections.meta.slugInvalid'));

                return;
            }

            const params: { query: { slug: string; exclude?: number } } = {
                query: { slug: key },
            };

            if (editing?.id) {
                params.query.exclude = editing.id;
            }

            void fetch(ContentCollectionController.checkSlug.url(params), {
                method: 'GET',
                headers: jsonRequestHeaders(),
                credentials: 'same-origin',
                signal: controller.signal,
            })
                .then(async (response) => {
                    if (!response.ok) {
                        return;
                    }

                    const data = (await response.json()) as {
                        available?: boolean;
                    };

                    if (data.available === false) {
                        setDebouncedSlugError(t('collections.meta.slugTaken'));
                    } else {
                        setDebouncedSlugError(undefined);
                    }
                })
                .catch((error: unknown) => {
                    if (
                        error instanceof DOMException &&
                        error.name === 'AbortError'
                    ) {
                        return;
                    }
                });
        }, 350);

        return () => {
            window.clearTimeout(handle);
            controller.abort();
        };
    }, [form.data.slug, editing?.id, t]);

    const slugError = form.errors.slug ?? debouncedSlugError;

    return (
        <DrawerContent>
            <DrawerHeader>
                <DrawerTitle>{title}</DrawerTitle>
                <DrawerDescription>
                    {editing
                        ? t('collections.meta.editDescription')
                        : t('collections.meta.createDescription')}
                </DrawerDescription>
            </DrawerHeader>

            <form
                className="flex min-h-0 flex-1 flex-col overflow-hidden"
                noValidate
                onSubmit={(e) => {
                    e.preventDefault();
                    submit();
                }}
            >
                <DrawerBody>
                    <FieldGroup className="gap-4">
                        <Field
                            data-invalid={form.errors.name ? true : undefined}
                        >
                            <FieldLabel htmlFor="collection_drawer_name">
                                {t('collections.meta.name')}{' '}
                                <span className="text-destructive">*</span>
                            </FieldLabel>
                            <Input
                                id="collection_drawer_name"
                                value={form.data.name}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    form.setData('name', v);

                                    if (!slugManual) {
                                        form.setData('slug', slugify(v));
                                    }
                                }}
                                required
                                // oxlint-disable-next-line jsx-a11y/no-autofocus -- focus primary field when surface opens
                                autoFocus
                                aria-invalid={
                                    form.errors.name ? true : undefined
                                }
                                aria-describedby={
                                    form.errors.name
                                        ? 'collection-drawer-name-error'
                                        : undefined
                                }
                            />
                            <FieldError id="collection-drawer-name-error">
                                {form.errors.name}
                            </FieldError>
                        </Field>
                        <Field data-invalid={slugError ? true : undefined}>
                            <FieldLabel htmlFor="collection_drawer_slug">
                                {t('collections.meta.slug')}{' '}
                                <span className="text-destructive">*</span>
                            </FieldLabel>
                            <Input
                                id="collection_drawer_slug"
                                value={form.data.slug}
                                onChange={(e) => {
                                    setSlugManual(true);
                                    form.setData(
                                        'slug',
                                        slugifyInput(e.target.value),
                                    );
                                }}
                                onBlur={() =>
                                    form.setData(
                                        'slug',
                                        slugify(form.data.slug),
                                    )
                                }
                                required
                                placeholder="my-collection"
                                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                                className="font-mono"
                                aria-invalid={Boolean(slugError)}
                                aria-describedby={
                                    slugError
                                        ? 'collection-drawer-slug-error'
                                        : undefined
                                }
                            />
                            <FieldError id="collection-drawer-slug-error">
                                {slugError}
                            </FieldError>
                        </Field>
                        <Field
                            data-invalid={
                                form.errors.description ? true : undefined
                            }
                        >
                            <FieldLabel htmlFor="collection_drawer_description">
                                {t('collections.meta.description')}
                            </FieldLabel>
                            <Textarea
                                id="collection_drawer_description"
                                value={form.data.description}
                                onChange={(e) =>
                                    form.setData('description', e.target.value)
                                }
                                rows={3}
                                placeholder={t(
                                    'collections.meta.descriptionPlaceholder',
                                )}
                                aria-invalid={
                                    form.errors.description ? true : undefined
                                }
                                aria-describedby={
                                    form.errors.description
                                        ? 'collection-drawer-description-error'
                                        : undefined
                                }
                            />
                            <FieldError id="collection-drawer-description-error">
                                {form.errors.description}
                            </FieldError>
                        </Field>
                        <Field
                            data-invalid={form.errors.status ? true : undefined}
                        >
                            <FieldLabel htmlFor="collection_drawer_status">
                                {t('collections.meta.status')}
                            </FieldLabel>
                            <Select
                                value={form.data.status}
                                onValueChange={(value) =>
                                    form.setData(
                                        'status',
                                        value as 'active' | 'inactive',
                                    )
                                }
                            >
                                <SelectTrigger
                                    id="collection_drawer_status"
                                    className="w-full"
                                    aria-invalid={
                                        form.errors.status ? true : undefined
                                    }
                                    aria-describedby={
                                        form.errors.status
                                            ? 'collection-drawer-status-error'
                                            : 'collection-drawer-status-hint'
                                    }
                                >
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="active">
                                        {t('collections.meta.statusActive')}
                                    </SelectItem>
                                    <SelectItem value="inactive">
                                        {t('collections.meta.statusInactive')}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                            <FieldDescription id="collection-drawer-status-hint">
                                {t('collections.meta.statusHint')}
                            </FieldDescription>
                            <FieldError id="collection-drawer-status-error">
                                {form.errors.status}
                            </FieldError>
                        </Field>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <LucideIconPicker
                                id="collection_drawer_icon"
                                label={t('collections.meta.icon')}
                                value={form.data.icon}
                                onChange={(next) => form.setData('icon', next)}
                            />
                            <Field
                                data-invalid={
                                    form.errors.color ? true : undefined
                                }
                            >
                                <FieldLabel htmlFor="collection_drawer_color">
                                    {t('collections.meta.color')}
                                </FieldLabel>
                                <div className="flex items-center gap-2">
                                    <Input
                                        id="collection_drawer_color"
                                        type="color"
                                        value={
                                            resolveCollectionColor(
                                                form.data.color,
                                            ) ??
                                            COLLECTION_COLOR_PICKER_FALLBACK
                                        }
                                        onChange={(e) =>
                                            form.setData(
                                                'color',
                                                e.target.value,
                                            )
                                        }
                                        className="w-12 shrink-0 cursor-pointer border-0 p-1 shadow-none focus-visible:ring-0 [&::-webkit-color-swatch]:rounded-[3px] [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
                                    />
                                    <InputGroup className="min-w-0 flex-1">
                                        <InputGroupInput
                                            type="text"
                                            value={form.data.color ?? ''}
                                            onChange={(e) =>
                                                form.setData(
                                                    'color',
                                                    e.target.value,
                                                )
                                            }
                                            placeholder={
                                                COLLECTION_COLOR_PICKER_FALLBACK
                                            }
                                            className="font-mono"
                                            aria-invalid={
                                                form.errors.color
                                                    ? true
                                                    : undefined
                                            }
                                            aria-describedby={
                                                form.errors.color
                                                    ? 'collection-drawer-color-error'
                                                    : undefined
                                            }
                                        />
                                        {form.data.color ? (
                                            <InputGroupAddon align="inline-end">
                                                <InputGroupButton
                                                    size="icon-xs"
                                                    onClick={() =>
                                                        form.setData(
                                                            'color',
                                                            '',
                                                        )
                                                    }
                                                    aria-label={t(
                                                        'collections.meta.clearColor',
                                                    )}
                                                >
                                                    <X />
                                                </InputGroupButton>
                                            </InputGroupAddon>
                                        ) : null}
                                    </InputGroup>
                                </div>
                                <FieldError id="collection-drawer-color-error">
                                    {form.errors.color}
                                </FieldError>
                            </Field>
                        </div>
                        <Field
                            data-invalid={
                                form.errors.is_singleton ? true : undefined
                            }
                        >
                            <div className="flex items-center gap-2">
                                <Checkbox
                                    id="collection_drawer_singleton"
                                    checked={form.data.is_singleton}
                                    disabled={editing !== null}
                                    onCheckedChange={(isChecked) =>
                                        form.setData(
                                            'is_singleton',
                                            isChecked === true,
                                        )
                                    }
                                />
                                <FieldLabel
                                    htmlFor="collection_drawer_singleton"
                                    className={
                                        editing !== null
                                            ? 'font-normal text-muted-foreground'
                                            : 'font-normal'
                                    }
                                >
                                    {t('collections.meta.singleton')}
                                </FieldLabel>
                            </div>
                            {!editing && (
                                <FieldDescription id="collection-drawer-singleton-hint">
                                    {t('collections.meta.singletonHint')}
                                </FieldDescription>
                            )}
                            <FieldError id="collection-drawer-singleton-error">
                                {form.errors.is_singleton}
                            </FieldError>
                        </Field>
                        <div className="grid gap-3 rounded-md border p-4">
                            <Field
                                data-invalid={
                                    form.errors.versioning ? true : undefined
                                }
                            >
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id="collection_drawer_versioning"
                                        checked={Boolean(form.data.versioning)}
                                        onCheckedChange={(isChecked) => {
                                            form.setData(
                                                'versioning',
                                                isChecked === true,
                                            );

                                            if (isChecked !== true) {
                                                form.setData(
                                                    'approvals_required',
                                                    false,
                                                );
                                            }
                                        }}
                                    />
                                    <FieldLabel
                                        htmlFor="collection_drawer_versioning"
                                        className="font-normal"
                                    >
                                        {t('collections.meta.versioning')}
                                    </FieldLabel>
                                </div>
                                <FieldDescription id="collection-drawer-versioning-hint">
                                    {t('collections.meta.versioningHint')}
                                </FieldDescription>
                                <FieldError id="collection-drawer-versioning-error">
                                    {form.errors.versioning}
                                </FieldError>
                            </Field>
                            <Field
                                className="border-t pt-3"
                                data-invalid={
                                    form.errors.approvals_required
                                        ? true
                                        : undefined
                                }
                            >
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id="collection_drawer_approvals"
                                        checked={Boolean(
                                            form.data.approvals_required,
                                        )}
                                        disabled={!form.data.versioning}
                                        onCheckedChange={(isChecked) =>
                                            form.setData(
                                                'approvals_required',
                                                isChecked === true,
                                            )
                                        }
                                        data-test="collection-approvals-required"
                                    />
                                    <FieldLabel
                                        htmlFor="collection_drawer_approvals"
                                        className="font-normal"
                                    >
                                        {t(
                                            'collections.meta.approvalsRequired',
                                        )}
                                    </FieldLabel>
                                </div>
                                <FieldDescription id="collection-drawer-approvals-hint">
                                    {t(
                                        'collections.meta.approvalsRequiredHint',
                                    )}
                                </FieldDescription>
                                <FieldError id="collection-drawer-approvals-error">
                                    {form.errors.approvals_required}
                                </FieldError>
                            </Field>
                            <Field
                                className="border-t pt-3"
                                data-invalid={
                                    form.errors.preview_url ? true : undefined
                                }
                            >
                                <FieldLabel htmlFor="collection_drawer_preview_url">
                                    {t('collections.meta.previewUrl')}
                                </FieldLabel>
                                <Input
                                    id="collection_drawer_preview_url"
                                    type="url"
                                    value={form.data.preview_url ?? ''}
                                    placeholder={t(
                                        'collections.meta.previewUrlPlaceholder',
                                    )}
                                    onChange={(e) =>
                                        form.setData(
                                            'preview_url',
                                            e.target.value,
                                        )
                                    }
                                    data-test="collection-preview-url"
                                    aria-invalid={
                                        form.errors.preview_url
                                            ? true
                                            : undefined
                                    }
                                    aria-describedby={
                                        form.errors.preview_url
                                            ? 'collection-drawer-preview-url-error'
                                            : 'collection-drawer-preview-url-hint'
                                    }
                                />
                                <FieldDescription id="collection-drawer-preview-url-hint">
                                    {t('collections.meta.previewUrlHint')}
                                </FieldDescription>
                                <FieldError id="collection-drawer-preview-url-error">
                                    {form.errors.preview_url}
                                </FieldError>
                            </Field>
                            <div className="grid gap-3 border-t pt-3">
                                <div className="grid gap-1">
                                    <p className="text-sm font-medium">
                                        {t(
                                            'collections.meta.revisionRetention',
                                        )}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        {t(
                                            'collections.meta.revisionRetentionHint',
                                        )}
                                    </p>
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <Field
                                        data-invalid={
                                            form.errors.revision_retention_count
                                                ? true
                                                : undefined
                                        }
                                    >
                                        <FieldLabel htmlFor="collection_drawer_retention_count">
                                            {t(
                                                'collections.meta.revisionRetentionCount',
                                            )}
                                        </FieldLabel>
                                        <Input
                                            id="collection_drawer_retention_count"
                                            type="number"
                                            min={1}
                                            max={10000}
                                            value={
                                                form.data
                                                    .revision_retention_count ??
                                                ''
                                            }
                                            onChange={(e) =>
                                                form.setData(
                                                    'revision_retention_count',
                                                    e.target.value === ''
                                                        ? null
                                                        : Number(
                                                              e.target.value,
                                                          ),
                                                )
                                            }
                                            aria-invalid={
                                                form.errors
                                                    .revision_retention_count
                                                    ? true
                                                    : undefined
                                            }
                                            aria-describedby={
                                                form.errors
                                                    .revision_retention_count
                                                    ? 'collection-drawer-retention-count-error'
                                                    : undefined
                                            }
                                        />
                                        <FieldError id="collection-drawer-retention-count-error">
                                            {
                                                form.errors
                                                    .revision_retention_count
                                            }
                                        </FieldError>
                                    </Field>
                                    <Field
                                        data-invalid={
                                            form.errors.revision_retention_days
                                                ? true
                                                : undefined
                                        }
                                    >
                                        <FieldLabel htmlFor="collection_drawer_retention_days">
                                            {t(
                                                'collections.meta.revisionRetentionDays',
                                            )}
                                        </FieldLabel>
                                        <Input
                                            id="collection_drawer_retention_days"
                                            type="number"
                                            min={1}
                                            max={3650}
                                            value={
                                                form.data
                                                    .revision_retention_days ??
                                                ''
                                            }
                                            onChange={(e) =>
                                                form.setData(
                                                    'revision_retention_days',
                                                    e.target.value === ''
                                                        ? null
                                                        : Number(
                                                              e.target.value,
                                                          ),
                                                )
                                            }
                                            aria-invalid={
                                                form.errors
                                                    .revision_retention_days
                                                    ? true
                                                    : undefined
                                            }
                                            aria-describedby={
                                                form.errors
                                                    .revision_retention_days
                                                    ? 'collection-drawer-retention-days-error'
                                                    : undefined
                                            }
                                        />
                                        <FieldError id="collection-drawer-retention-days-error">
                                            {
                                                form.errors
                                                    .revision_retention_days
                                            }
                                        </FieldError>
                                    </Field>
                                </div>
                            </div>
                        </div>
                    </FieldGroup>
                </DrawerBody>

                <DrawerFooter className="flex flex-row justify-end gap-2">
                    <Button type="button" variant="outline" onClick={onCancel}>
                        {t('collections.meta.cancel')}
                    </Button>
                    <Button type="submit" disabled={form.processing}>
                        {editing
                            ? t('collections.meta.save')
                            : t('collections.meta.create')}
                    </Button>
                </DrawerFooter>
            </form>
        </DrawerContent>
    );
}
