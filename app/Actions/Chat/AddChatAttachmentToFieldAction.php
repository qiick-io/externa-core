<?php

declare(strict_types=1);

namespace App\Actions\Chat;

use App\Actions\Collections\UpdateCollectionItemAction;
use App\Data\Collections\CollectionItemWriteData;
use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\CollectionItemChatAttachment;
use App\Models\File;
use App\Services\Api\CollectionPermissionEnforcerService;
use App\Services\Collections\CollectionItemValuesAssemblerService;
use App\Support\Collections\CollectionLocaleResolver;
use Illuminate\Http\Request;

/**
 * Put a chat attachment into an image or files field of the thread's item:
 * transfer it to the Files pool, then set (image) or append (files) its file
 * id in the current locale. The caller has checked access to the thread, the
 * attachment and the item write (`AddChatAttachmentToFieldRequest`).
 */
class AddChatAttachmentToFieldAction
{
    public function __construct(
        private TransferChatAttachmentToFileAction $transferToFile,
        private CollectionPermissionEnforcerService $permissionEnforcer,
        private CollectionItemValuesAssemblerService $assembler,
        private UpdateCollectionItemAction $updateCollectionItemAction,
        private CollectionLocaleResolver $localeResolver,
    ) {}

    /**
     * Aborts 404 for an unknown field, 422 for a field that does not hold
     * files, 403 when the user may not write the field. Saves the item as a
     * draft on versioned collections.
     *
     * @return array{file: File, field: string, value: mixed}
     */
    public function execute(
        Request $request,
        Collection $collection,
        CollectionItem $item,
        CollectionItemChatAttachment $attachment,
        string $fieldName,
    ): array {
        $collection->load(['fields' => fn ($q) => $q->ordered()]);
        $field = $collection->fields->first(
            fn (CollectionField $row): bool => $row->name === $fieldName,
        );
        abort_unless($field instanceof CollectionField, 404);

        $allowedTypes = [FieldTypeEnum::Image, FieldTypeEnum::Files];
        abort_unless(in_array($field->type, $allowedTypes, true), 422);

        $file = $this->transferToFile->execute($attachment);
        $fileId = (int) $file->id;

        $this->permissionEnforcer->assertWritableFields(
            $request,
            $collection,
            [$field->name => $field->type === FieldTypeEnum::Files ? [$fileId] : $fileId],
            'update',
        );

        $assembled = $this->assembler->assemble($item);
        $assembled[$field->name] = $this->mergedFieldValue($field, $assembled[$field->name] ?? null, $fileId);
        $this->updateCollectionItemAction->execute(new CollectionItemWriteData(
            collection: $collection,
            data: $assembled,
            item: $item,
            creating: false,
            version: $collection->versioning ? 'draft' : 'published',
            shouldValidate: false,
            shouldMergeIncoming: false,
            shouldEnforceVersioningGuard: false,
        ));

        return [
            'file' => $file,
            'field' => $field->name,
            'value' => $assembled[$field->name],
        ];
    }

    /**
     * Merge a file id into an image/file/files field value (append for files).
     */
    private function mergedFieldValue(CollectionField $field, mixed $current, int $fileId): mixed
    {
        $locale = $this->localeResolver->resolve();

        if ($field->translatable) {
            $map = is_array($current) ? $current : [];
            $map[$locale] = $this->mergeScalarOrList($field, $map[$locale] ?? null, $fileId);

            return $map;
        }

        return $this->mergeScalarOrList($field, $current, $fileId);
    }

    private function mergeScalarOrList(CollectionField $field, mixed $current, int $fileId): mixed
    {
        if (! $field->hasArrayStorage()) {
            return $fileId;
        }

        $list = is_array($current) ? array_map('intval', $current) : [];
        if (! in_array($fileId, $list, true)) {
            $list[] = $fileId;
        }

        return array_values($list);
    }
}
