import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import {
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { slugify, type UseCollectionsReturn } from '@/hooks/use-collections';
import type { CollectionRow } from '@/types/collections';

export type CollectionFormDrawerProps = {
    editing: CollectionRow | null;
    slugManual: boolean;
    setSlugManual: (manual: boolean) => void;
    form: UseCollectionsReturn['form'];
    title: string;
    submit: () => void;
};

export function CollectionFormDrawer({
    editing,
    slugManual,
    setSlugManual,
    form,
    title,
    submit,
}: CollectionFormDrawerProps) {
    return (
        <DrawerContent className="max-h-screen">
            <DrawerHeader>
                <DrawerTitle>{title}</DrawerTitle>
                <DrawerDescription>
                    {editing
                        ? 'Update name, slug, and whether this collection holds a single content item.'
                        : 'Create a collection. Slug is generated from the name unless you edit it.'}
                </DrawerDescription>
            </DrawerHeader>

            <form
                className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4"
                onSubmit={(e) => {
                    e.preventDefault();
                    submit();
                }}
            >
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
                <div className="flex items-center gap-2">
                    <input
                        id="collection_drawer_singleton"
                        type="checkbox"
                        className="size-4 rounded border"
                        checked={form.data.is_singleton}
                        onChange={(e) =>
                            form.setData('is_singleton', e.target.checked)
                        }
                    />
                    <Label htmlFor="collection_drawer_singleton">
                        Singleton (one content item)
                    </Label>
                </div>

                <DrawerFooter className="flex flex-row justify-end gap-2 px-0">
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
