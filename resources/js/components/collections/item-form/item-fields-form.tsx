import { Form } from '@inertiajs/react';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import ItemController from '@/actions/App/Http/Controllers/Collections/ItemController';
import { DynamicItemFields } from '@/components/collections/dynamic-item-fields';
import { COLLECTION_ITEM_FORM_ID } from '@/components/collections/item-form/item-form-helpers';
import type { FieldGrant } from '@/components/collections/item-form/item-form-helpers';
import { getNonFieldErrors } from '@/lib/collection-data-errors';
import { toast } from '@/lib/toast';
import { wayfinderInertiaFormProps } from '@/lib/wayfinder-form';
import type { CollectionView } from '@/types/collections';

/**
 * The item's field form: an uncontrolled Inertia `<Form>` that creates
 * (`ItemController.store`) or updates (`ItemController.update`) the item.
 * The edit form also posts the version and the optimistic-lock token
 * (`expected_updated_at`) and explains why it is read-only when it is.
 * The page remounts it through `key` to throw unsaved input away.
 */
export function ItemFieldsForm({
    collection,
    itemId,
    isNew,
    locales,
    contentDefaults,
    relatedCollections,
    fieldGrants,
    fieldSearch,
    globalLocale,
    formReadonly,
    revisionApply,
    versioningEnabled,
    contentVersion,
    expectedUpdatedAt,
    lockedByOther,
    lockHolderName,
    onSaved,
    onEdited,
}: {
    collection: CollectionView;
    /** The item on the edit form; null on the create form. */
    itemId: number | null;
    isNew: boolean;
    locales: string[];
    contentDefaults: ComponentProps<typeof DynamicItemFields>['defaults'];
    relatedCollections: { id: number; name: string; slug: string }[];
    fieldGrants: Record<string, FieldGrant> | null;
    fieldSearch: string;
    globalLocale: string;
    formReadonly: boolean;
    revisionApply: ComponentProps<typeof DynamicItemFields>['revisionApply'];
    versioningEnabled: boolean;
    contentVersion: 'published' | 'draft';
    expectedUpdatedAt: string;
    lockedByOther: boolean;
    lockHolderName: string | null | undefined;
    /** After a successful save. */
    onSaved: () => void;
    /** After any input or change in the form. */
    onEdited: () => void;
}) {
    const { t } = useTranslation();

    const formProps =
        isNew || itemId === null
            ? wayfinderInertiaFormProps(
                  ItemController.store,
                  { collection: collection.id },
                  'post',
              )
            : wayfinderInertiaFormProps(
                  ItemController.update,
                  {
                      collection: collection.id,
                      item: itemId,
                  },
                  'put',
              );

    // Only the edit form ignores input while read-only (published version, or locked by a peer).
    const handleEdit = (): void => {
        if (!isNew && formReadonly) {
            return;
        }

        onEdited();
    };

    return (
        <Form
            {...formProps}
            id={COLLECTION_ITEM_FORM_ID}
            className="space-y-6"
            options={{ preserveScroll: true }}
            onSuccess={onSaved}
            onError={(errors) => {
                const nonFieldErrors = getNonFieldErrors(errors);

                if (nonFieldErrors.length > 0) {
                    nonFieldErrors.forEach((msg) => {
                        toast.error(msg);
                    });
                }
            }}
            onInput={handleEdit}
            onChange={handleEdit}
        >
            {({ errors }) => (
                <>
                    <input
                        type="hidden"
                        name="save_action"
                        defaultValue="stay"
                    />
                    {!isNew && versioningEnabled ? (
                        <input
                            type="hidden"
                            name="version"
                            value={contentVersion}
                        />
                    ) : null}
                    {!isNew ? (
                        <input
                            type="hidden"
                            name="expected_updated_at"
                            value={expectedUpdatedAt}
                        />
                    ) : null}
                    {!isNew && formReadonly ? (
                        <p
                            className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning"
                            data-test={
                                lockedByOther
                                    ? 'item-soft-lock-banner'
                                    : 'published-readonly-banner'
                            }
                        >
                            {lockedByOther
                                ? t('collections.itemPresence.lockedBy', {
                                      name: lockHolderName ?? '…',
                                  })
                                : t(
                                      'collections.itemToolbar.publishedReadOnly',
                                  )}
                        </p>
                    ) : null}
                    <DynamicItemFields
                        variant="plain"
                        collectionId={collection.id}
                        fields={collection.fields}
                        locales={locales}
                        defaults={contentDefaults}
                        relatedCollections={relatedCollections}
                        formLayout={collection.form_layout}
                        fieldGrants={fieldGrants}
                        isNew={isNew}
                        fieldSearch={fieldSearch}
                        errors={errors as Record<string, unknown>}
                        defaultLocale={globalLocale}
                        forceReadonly={formReadonly}
                        revisionApply={revisionApply}
                    />
                </>
            )}
        </Form>
    );
}
