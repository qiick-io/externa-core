import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ContentCollectionController from '@/actions/App/Http/Controllers/Collections/ContentCollectionController';
import { LucideIconPicker } from '@/components/collections/field-settings/lucide-icon-picker';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import {
    DrawerBody,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { slugify } from '@/hooks/use-collections';
import type { UseCollectionsReturn } from '@/hooks/use-collections';
import { jsonRequestHeaders } from '@/lib/csrf';
import {
    COLLECTION_SLUG_PATTERN,
    slugify as finalizeSlug,
    slugifyInput,
} from '@/lib/slugify';
import {
    COLLECTION_COLOR_PICKER_FALLBACK,
    resolveCollectionColor,
    type CollectionRow,
} from '@/types/collections';

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
                : finalizeSlug(form.data.slug);

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
                onSubmit={(e) => {
                    e.preventDefault();
                    submit();
                }}
            >
                <DrawerBody className="flex flex-col gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="collection_drawer_name">
                            {t('collections.meta.name')}{' '}
                            <span className="text-destructive">*</span>
                        </Label>
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
                            autoFocus
                        />
                        <InputError message={form.errors.name} />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="collection_drawer_slug">
                            {t('collections.meta.slug')}{' '}
                            <span className="text-destructive">*</span>
                        </Label>
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
                                    finalizeSlug(form.data.slug),
                                )
                            }
                            required
                            placeholder="my-collection"
                            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                            aria-invalid={Boolean(slugError)}
                        />
                        <InputError message={slugError} />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="collection_drawer_description">
                            {t('collections.meta.description')}
                        </Label>
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
                        />
                        <InputError message={form.errors.description} />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="collection_drawer_status">
                            {t('collections.meta.status')}
                        </Label>
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
                        <p className="text-sm text-muted-foreground">
                            {t('collections.meta.statusHint')}
                        </p>
                        <InputError message={form.errors.status} />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <LucideIconPicker
                            id="collection_drawer_icon"
                            label={t('collections.meta.icon')}
                            value={form.data.icon}
                            onChange={(next) => form.setData('icon', next)}
                        />
                        <div className="grid gap-2">
                            <Label htmlFor="collection_drawer_color">
                                {t('collections.meta.color')}
                            </Label>
                            <div className="flex items-center gap-2">
                                <Input
                                    id="collection_drawer_color"
                                    type="color"
                                    value={
                                        resolveCollectionColor(
                                            form.data.color,
                                        ) ?? COLLECTION_COLOR_PICKER_FALLBACK
                                    }
                                    onChange={(e) =>
                                        form.setData('color', e.target.value)
                                    }
                                    className="h-9 w-12 shrink-0 cursor-pointer border-0 p-1 shadow-none focus-visible:ring-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-[3px] [&::-webkit-color-swatch]:border-0"
                                />
                                <div className="relative min-w-0 flex-1">
                                    <Input
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
                                        className="pr-8 font-mono"
                                    />
                                    {form.data.color ? (
                                        <button
                                            type="button"
                                            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
                                            onClick={() =>
                                                form.setData('color', '')
                                            }
                                            aria-label={t(
                                                'collections.meta.clearColor',
                                            )}
                                        >
                                            <X className="size-4" />
                                        </button>
                                    ) : null}
                                </div>
                            </div>
                            <InputError message={form.errors.color} />
                        </div>
                    </div>
                    <div className="grid gap-2">
                        <div className="flex items-center gap-2">
                            <input
                                id="collection_drawer_singleton"
                                type="checkbox"
                                className="size-4 rounded border disabled:cursor-not-allowed disabled:opacity-60"
                                checked={form.data.is_singleton}
                                disabled={editing !== null}
                                onChange={(e) =>
                                    form.setData(
                                        'is_singleton',
                                        e.target.checked,
                                    )
                                }
                            />
                            <Label
                                htmlFor="collection_drawer_singleton"
                                className={
                                    editing !== null
                                        ? 'text-muted-foreground'
                                        : undefined
                                }
                            >
                                {t('collections.meta.singleton')}
                            </Label>
                        </div>
                        {!editing && (
                            <p className="text-sm text-muted-foreground">
                                {t('collections.meta.singletonHint')}
                            </p>
                        )}
                        <InputError message={form.errors.is_singleton} />
                    </div>
                </DrawerBody>

                <DrawerFooter className="flex flex-row justify-end gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onCancel}
                    >
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
