import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { addChatAttachmentToField } from '@/lib/item-chat-api';
import type { ChatAttachment, ChatScope } from '@/lib/item-chat-api';
import type { CollectionFieldRow } from '@/types/collections';

type ItemChatAddToFieldDialogProps = {
    /** The attachment to copy into a field; `null` keeps the dialog closed. */
    attachment: ChatAttachment | null;
    scope: ChatScope | null;
    /** The item's image and files fields. */
    fileFields: CollectionFieldRow[];
    fieldName: string;
    onFieldNameChange: (name: string) => void;
    onClose: () => void;
    onError: (message: string) => void;
};

/**
 * Dialog that copies a chat attachment into one of the item's image or files fields.
 */
export function ItemChatAddToFieldDialog({
    attachment,
    scope,
    fileFields,
    fieldName,
    onFieldNameChange,
    onClose,
    onError,
}: ItemChatAddToFieldDialogProps) {
    const { t } = useTranslation();

    return (
        <Dialog
            open={attachment !== null}
            onOpenChange={(next) => {
                if (!next) {
                    onClose();
                }
            }}
        >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {t('collections.itemChat.addToFieldTitle')}
                    </DialogTitle>
                </DialogHeader>
                {fileFields.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        {t('collections.itemChat.noFileFields')}
                    </p>
                ) : (
                    <div className="space-y-2">
                        <Label htmlFor="item-chat-add-field">
                            {t('collections.itemChat.selectField')}
                        </Label>
                        <NativeSelect
                            id="item-chat-add-field"
                            className="w-full"
                            value={fieldName}
                            onChange={(event) =>
                                onFieldNameChange(event.target.value)
                            }
                        >
                            {fileFields.map((field) => (
                                <option key={field.id} value={field.name}>
                                    {field.name} ({field.type})
                                </option>
                            ))}
                        </NativeSelect>
                    </div>
                )}
                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={onClose}>
                        {t('common.cancel')}
                    </Button>
                    <Button
                        type="button"
                        disabled={
                            attachment === null ||
                            fieldName === '' ||
                            fileFields.length === 0
                        }
                        onClick={() => {
                            if (attachment === null || fieldName === '') {
                                return;
                            }

                            void addChatAttachmentToField(
                                scope!,
                                attachment.id,
                                fieldName,
                            )
                                .then(() => onClose())
                                .catch((err: unknown) => {
                                    onError(
                                        err instanceof Error
                                            ? err.message
                                            : t(
                                                  'collections.itemChat.sendError',
                                              ),
                                    );
                                });
                        }}
                    >
                        {t('collections.itemChat.addToField')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
