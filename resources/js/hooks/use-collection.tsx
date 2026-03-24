import { router, usePage } from '@inertiajs/react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import FieldController from '@/actions/App/Http/Controllers/Cms/FieldController';
import { Button } from '@/components/ui/button';
import cms from '@/routes/cms';
import type { BreadcrumbItem } from '@/types';
import type { CmsCollection } from '@/types/cms-collections';

// Class names string for styling select input components
export const CMS_SELECT_INPUT_CLASS =
    'border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 w-full max-w-md rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-none';

// Input type for the useCollection hook
export type UseCollectionInput = {
    collection: CmsCollection;
    singletonRawData: Record<string, unknown> | null;
    editableRawData: Record<string, unknown> | null;
};

/**
 * Custom hook for working with a CMS collection.
 * This hook provides locale handling, UI state (like the drawer),
 * field management utilities, breadcrumbs, and more.
 */
export function useCollection({
    collection,
    singletonRawData,
    editableRawData,
}: UseCollectionInput): {
    locales: string[];
    fieldDrawerOpen: boolean;
    setFieldDrawerOpen: (open: boolean) => void;
    fieldType: string;
    setFieldType: (type: string) => void;
    settingsPlaceholder: string;
    breadcrumbs: BreadcrumbItem[];
    contentDefaults: Record<string, unknown>;
    hasFields: boolean;
    removeField: (field: { id: number; name: string }) => void;
    fieldActions: (field: { id: number; name: string }) => ReactNode;
} {
    // Get available locales from the page props
    const { cmsLocales } = usePage().props;
    const locales = (cmsLocales as string[]) ?? ['en'];

    // State for controlling the field drawer UI
    const [fieldDrawerOpen, setFieldDrawerOpen] = useState(false);

    // State to track the currently selected field type
    const [fieldType, setFieldType] = useState('string');

    // Whenever the drawer is opened, reset the field type to "string"
    useEffect(() => {
        if (fieldDrawerOpen) {
            setFieldType('string');
        }
    }, [fieldDrawerOpen]);

    // Placeholder JSON for settings (used for fields like select/multiselect)
    const settingsPlaceholder = useMemo(
        () =>
            JSON.stringify(
                {
                    options: [
                        { value: 'a', label: 'Option A' },
                        { value: 'b', label: 'Option B' },
                    ],
                },
                null,
                2,
            ),
        [],
    );

    // Compute breadcrumbs for the collection view
    const breadcrumbs: BreadcrumbItem[] = useMemo(
        () => [
            { title: 'CMS', href: cms.collections.index.url() },
            {
                title: collection.name,
                href: cms.collections.show.url(collection.id),
            },
        ],
        [collection.id, collection.name],
    );

    // Compute default content, using the singleton or editable data as needed
    const contentDefaults =
        collection.is_singleton
            ? (singletonRawData ?? {})
            : (editableRawData ?? {});

    // Check if the collection currently has any fields defined
    const hasFields = collection.fields.length > 0;

    /**
     * Remove an individual field from the collection.
     * Prompts for user confirmation, then dispatches a delete request.
     */
    const removeField = useCallback(
        (field: { id: number; name: string }): void => {
            if (
                !confirm(
                    `Remove field “${field.name}”? This does not delete existing item data keys until you save items.`,
                )
            ) {
                return;
            }
            router.delete(
                FieldController.destroy.url({
                    collection: collection.id,
                    field: field.id,
                }),
                { preserveScroll: true },
            );
        },
        [collection.id],
    );

    /**
     * Renders field actions (currently just a "Remove" button)
     * for use in a fields list/table.
     */
    const fieldActions = useCallback(
        (field: { id: number; name: string }) => (
            <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => removeField(field)}
            >
                Remove
            </Button>
        ),
        [removeField],
    );

    // Return all utilities, state, and handlers provided by the hook
    return {
        locales,
        fieldDrawerOpen,
        setFieldDrawerOpen,
        fieldType,
        setFieldType,
        settingsPlaceholder,
        breadcrumbs,
        contentDefaults,
        hasFields,
        removeField,
        fieldActions,
    };
}
