import {
    Calendar,
    CheckSquare,
    Code2,
    FileText,
    Files,
    Fingerprint,
    Hash,
    Image,
    LayoutTemplate,
    Link2,
    List,
    ListTree,
    MapPin,
    Network,
    Palette,
    PanelsTopLeft,
    Rows3,
    Search,
    SlidersHorizontal,
    SquareStack,
    ToggleLeft,
    Type,
    Tags,
    TextQuote,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import {
    LucideIconByName,
    resolveCollectionIconName,
} from '@/components/collections/field-settings/lucide-icon-picker';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import {
    DrawerBody,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from '@/components/ui/drawer';
import {
    COLLECTION_FIELD_TYPE_GROUPS,
    fieldTypeDescription,
    fieldTypeGroupLabelKey,
    fieldTypeLabel,
} from '@/lib/collection-field-types';
import { STRING_LIMITS } from '@/lib/string-limits';
import { resolveCollectionColor } from '@/types';

/*
 * Field type picker drawer and the per-type icon + header shared by the
 * field settings drawer and the collection fields list.
 */

/** Lucide icon shown for each field type in pickers, headers and lists. */
export const FIELD_TYPE_ICONS: Record<
    string,
    ComponentType<{ className?: string }>
> = {
    string: Type,
    autocomplete: Search,
    api_autocomplete: Search,
    number: Hash,
    boolean: ToggleLeft,
    textarea: FileText,
    wysiwyg: TextQuote,
    markdown: FileText,
    code: Code2,
    date: Calendar,
    map: MapPin,
    color: Palette,
    select: List,
    multiselect: List,
    checkbox_group: CheckSquare,
    checkbox_group_tree: ListTree,
    radio_group: List,
    tag: Tags,
    image: Image,
    files: Files,
    blocks: LayoutTemplate,
    m2a: LayoutTemplate,
    many_to_many: Network,
    one_to_many: Link2,
    many_to_one: Link2,
    hash: Fingerprint,
    slider: SlidersHorizontal,
    group_accordion: Rows3,
    group_detail: PanelsTopLeft,
    group_raw: SquareStack,
    group_tabs: LayoutTemplate,
};

function fieldTypeMatchesQuery(
    type: string,
    query: string,
    t: (key: string, options?: { defaultValue?: string }) => string,
): boolean {
    const haystack = [
        type,
        fieldTypeLabel(type, t),
        fieldTypeDescription(type, t),
    ]
        .join(' ')
        .toLowerCase();

    return haystack.includes(query);
}

/** Searchable grid of field types, grouped like the type catalog. */
function FieldTypePicker({ onSelect }: { onSelect: (type: string) => void }) {
    const { t } = useTranslation();
    const [query, setQuery] = useState('');

    const filteredGroups = useMemo(() => {
        const normalized = query.trim().toLowerCase();

        if (normalized === '') {
            return COLLECTION_FIELD_TYPE_GROUPS;
        }

        return COLLECTION_FIELD_TYPE_GROUPS.map((group) => ({
            ...group,
            types: group.types.filter((type) =>
                fieldTypeMatchesQuery(type, normalized, t),
            ),
        })).filter((group) => group.types.length > 0);
    }, [query, t]);

    return (
        <Command shouldFilter={false} className="h-auto overflow-visible">
            <CommandInput
                value={query}
                onValueChange={setQuery}
                placeholder={t('collections.searchFieldTypes')}
                aria-label={t('collections.searchFieldTypes')}
                maxLength={STRING_LIMITS.SEARCH}
                // oxlint-disable-next-line jsx-a11y/no-autofocus -- focus primary field when surface opens
                autoFocus
            />
            <CommandList className="max-h-none overflow-visible">
                <CommandEmpty className="py-12 text-center text-sm text-muted-foreground">
                    {t('collections.noMatchingFieldTypes')}
                </CommandEmpty>
                {filteredGroups.map((group) => (
                    <CommandGroup
                        key={group.key}
                        heading={t(fieldTypeGroupLabelKey(group.key))}
                        className="pt-6 [&_[cmdk-group-items]]:grid [&_[cmdk-group-items]]:grid-cols-2 [&_[cmdk-group-items]]:gap-3 sm:[&_[cmdk-group-items]]:grid-cols-4"
                    >
                        {group.types.map((type) => {
                            const Icon = FIELD_TYPE_ICONS[type] ?? Type;

                            return (
                                <CommandItem
                                    key={type}
                                    value={type}
                                    onSelect={() => onSelect(type)}
                                    className="flex-col gap-3 rounded-lg border border-border px-3 py-6 text-center data-[selected=true]:border-primary/40"
                                >
                                    <Icon className="size-6" />
                                    <span className="text-xs leading-tight font-medium">
                                        {fieldTypeLabel(type, t)}
                                    </span>
                                </CommandItem>
                            );
                        })}
                    </CommandGroup>
                ))}
            </CommandList>
        </Command>
    );
}

/** Drawer header of the field settings form: type icon, label and description. */
export function FieldTypeHeader({
    fieldType,
    subtitle,
}: {
    fieldType: string;
    subtitle?: string;
}) {
    const { t } = useTranslation();
    const Icon = FIELD_TYPE_ICONS[fieldType] ?? Type;
    const description =
        subtitle ??
        (fieldTypeDescription(fieldType, t) ||
            t('collections.typeSettingsDescription'));

    return (
        <DrawerHeader>
            <div className="flex items-start gap-4">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border bg-muted/30">
                    <Icon className="size-6 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                    <DrawerTitle>{fieldTypeLabel(fieldType, t)}</DrawerTitle>
                    <DrawerDescription>{description}</DrawerDescription>
                </div>
            </div>
        </DrawerHeader>
    );
}

export type CollectionFieldTypeDrawerProps = {
    onSelectType: (type: string) => void;
    collectionName: string;
    collectionIcon?: string | null;
    collectionColor?: string | null;
};

/**
 * Drawer for choosing a collection field type.
 * @param {*} props - Component props.
 * @returns {JSX.Element}
 */
export function CollectionFieldTypeDrawer({
    onSelectType,
    collectionName,
    collectionIcon,
    collectionColor,
}: CollectionFieldTypeDrawerProps) {
    const { t } = useTranslation();
    const accent = resolveCollectionColor(collectionColor);

    return (
        <>
            <DrawerHeader>
                <div className="flex items-start gap-4">
                    <span
                        className="inline-flex size-12 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/40 text-muted-foreground"
                        style={
                            accent
                                ? {
                                      color: accent,
                                      borderColor: `${accent}55`,
                                      backgroundColor: `${accent}18`,
                                  }
                                : undefined
                        }
                        aria-hidden
                    >
                        <LucideIconByName
                            name={resolveCollectionIconName(collectionIcon)}
                            className="size-6"
                            style={accent ? { color: accent } : undefined}
                        />
                    </span>
                    <div className="min-w-0 flex-1">
                        <DrawerTitle>
                            {t('collections.addFieldFor', {
                                name: collectionName,
                            })}
                        </DrawerTitle>
                        <DrawerDescription>
                            {t('collections.chooseFieldType')}
                        </DrawerDescription>
                    </div>
                </div>
            </DrawerHeader>

            <DrawerBody>
                <FieldTypePicker onSelect={onSelectType} />
            </DrawerBody>
        </>
    );
}
