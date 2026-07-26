import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import {
    DrawerBody,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { slugify } from '@/hooks/use-collections';
import type { UseCollectionsReturn } from '@/hooks/use-collections';
import type { CollectionRow } from '@/types/collections';

export type CollectionFormDrawerProps = {
    editing: CollectionRow | null;
    slugManual: boolean;
    setSlugManual: (manual: boolean) => void;
    form: UseCollectionsReturn['form'];
    title: string;
    submit: () => void;
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
}: CollectionFormDrawerProps) {
    return (
        <DrawerContent>
            <DrawerHeader>
                <DrawerTitle>{title}</DrawerTitle>
                <DrawerDescription>
                    {editing
                        ? 'Update the collection name and slug. The singleton setting cannot be changed after creation.'
                        : 'Create a collection. Slug is generated from the name unless you edit it.'}
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
                        <Label htmlFor="collection_drawer_name">Name</Label>
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
                        <Label htmlFor="collection_drawer_slug">Slug</Label>
                        <Input
                            id="collection_drawer_slug"
                            value={form.data.slug}
                            onChange={(e) => {
                                setSlugManual(true);
                                form.setData('slug', e.target.value);
                            }}
                        />
                        <InputError message={form.errors.slug} />
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
                                Singleton (one content item)
                            </Label>
                        </div>
                        {!editing && (
                            <p className="text-sm text-muted-foreground">
                                Use this for collections with a single fixed
                                entry (e.g. homepage or site settings). This
                                choice cannot be changed after the collection is
                                created.
                            </p>
                        )}
                        <InputError message={form.errors.is_singleton} />
                    </div>
                </DrawerBody>

                <DrawerFooter className="flex flex-row justify-end gap-2">
                    <DrawerClose asChild>
                        <Button type="button" variant="outline">
                            Cancel
                        </Button>
                    </DrawerClose>
                    <Button type="submit" disabled={form.processing}>
                        {editing ? 'Save' : 'Create'}
                    </Button>
                </DrawerFooter>
            </form>
        </DrawerContent>
    );
}
