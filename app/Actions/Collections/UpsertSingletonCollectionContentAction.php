<?php

declare(strict_types=1);

namespace App\Actions\Collections;

use App\Data\Collections\CollectionItemWriteData;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Services\Collections\CollectionItemValuesAssemblerService;
use App\Services\Collections\FieldConditionEvaluatorService;

/**
 * Create or merge the content of a singleton collection's single item.
 *
 * On merge, readonly fields keep their stored values and associative maps (per-locale
 * values) are merged key by key; lists (blocks, m2a, files) are replaced, never appended.
 * Versioned collections write the draft.
 */
final class UpsertSingletonCollectionContentAction
{
    public function __construct(
        private CreateCollectionItemAction $createCollectionItemAction,
        private UpdateCollectionItemAction $updateCollectionItemAction,
        private CollectionItemValuesAssemblerService $collectionItemValuesAssembler,
        private FieldConditionEvaluatorService $fieldConditionEvaluator,
    ) {}

    /**
     * @param  array<string, mixed>  $incoming  submitted field values
     * @return bool true when the singleton item was created, false when it was updated
     */
    public function execute(Collection $collection, array $incoming): bool
    {
        $item = $collection->items()->first();

        if (! $item instanceof CollectionItem) {
            $this->createCollectionItemAction->execute(new CollectionItemWriteData(
                collection: $collection,
                data: $incoming,
                creating: true,
                shouldValidate: false,
            ));

            return true;
        }

        $data = $this->collectionItemValuesAssembler->assemble($item);
        $collection->loadMissing('fields');
        $incoming = $this->fieldConditionEvaluator->withoutReadonlyFields(
            $collection->fields,
            array_replace($data, $incoming),
            $incoming,
        );

        foreach ($incoming as $key => $value) {
            // ponytail: array_merge appends list fields (blocks/m2a/files); only merge associative maps (locales).
            if (
                is_array($value)
                && isset($data[$key])
                && is_array($data[$key])
                && ! array_is_list($value)
            ) {
                $data[$key] = array_merge($data[$key], $value);
            } else {
                $data[$key] = $value;
            }
        }

        $this->updateCollectionItemAction->execute(new CollectionItemWriteData(
            collection: $collection,
            data: $data,
            item: $item,
            creating: false,
            version: $collection->versioning ? 'draft' : 'published',
            shouldValidate: false,
            shouldMergeIncoming: false,
            shouldEnforceVersioningGuard: false,
        ));

        return false;
    }
}
