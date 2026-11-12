<?php

declare(strict_types=1);

namespace App\Services\Collections;

use App\Models\Collection;
use App\Models\CollectionItem;
use App\Services\Api\CollectionPermissionEnforcerService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;

/**
 * Guards and payload of an item editor save, before `UpdateCollectionItemAction` writes it:
 * the optimistic lock, the merge of the submitted fields over the current workspace, and
 * the warning shown when saving a draft resets an approval with a scheduled publish.
 */
class CollectionItemFormSaveService
{
    public function __construct(
        private CollectionItemValuesAssemblerService $collectionItemValuesAssembler,
        private CollectionItemDataNormalizerService $itemDataNormalizer,
        private CollectionPermissionEnforcerService $permissionEnforcer,
        private FieldConditionEvaluatorService $fieldConditionEvaluator,
    ) {}

    /**
     * Optimistic lock: reject the save when the item changed after the editor loaded it.
     *
     * Compared at second precision, because ISO 8601 round-trips can differ in microseconds.
     *
     * @throws ValidationException when `expected_updated_at` does not match the stored item
     */
    public function assertUnchangedSince(CollectionItem $item, mixed $expectedUpdatedAt): void
    {
        if (! is_string($expectedUpdatedAt) || $expectedUpdatedAt === '' || $item->updated_at === null) {
            return;
        }

        if ($item->updated_at->getTimestamp() !== Carbon::parse($expectedUpdatedAt)->getTimestamp()) {
            throw ValidationException::withMessages([
                'expected_updated_at' => [
                    __('Someone else saved this item while you were editing. Reload the page and try again.'),
                ],
            ]);
        }
    }

    /**
     * The full field data to save: the current workspace (draft or published values) with the
     * submitted fields merged over it. Readonly fields (also conditionally readonly ones,
     * evaluated against the merged values) keep their current value.
     *
     * @return array<string, mixed>
     */
    public function mergeFormInput(
        Request $request,
        Collection $collection,
        CollectionItem $item,
        string $version,
        mixed $incoming,
    ): array {
        $base = $version === 'draft' && is_array($item->draft_data)
            ? $item->draft_data
            : $this->collectionItemValuesAssembler->assemble($item);

        $data = $base;

        if (is_array($incoming)) {
            $this->permissionEnforcer->assertWritableFields($request, $collection, $incoming, 'update');
            $collection->loadMissing('fields');
            // Preview = base + attempted write so conditional readonly sees sibling values.
            $preview = array_replace($base, $incoming);
            $incoming = $this->fieldConditionEvaluator->withoutReadonlyFields(
                $collection->fields,
                $preview,
                $incoming,
            );

            $data = $this->itemDataNormalizer->mergeIncoming($data, $incoming);
        }

        return $data;
    }

    /**
     * The scheduled publish date to warn about when a draft save resets the approval of an
     * item that has one (the publish will not run until the item is approved again).
     * Must be read before the save, which clears the approval.
     */
    public function scheduleWarningDate(Collection $collection, CollectionItem $item, string $version): ?string
    {
        if (
            $version === 'draft'
            && $collection->approvals_required
            && in_array((string) $item->approval_status, ['approved', 'rejected', 'in_review'], true)
            && $item->publish_at !== null
        ) {
            return $item->publish_at->timezone(config('app.timezone'))
                ->toDayDateTimeString();
        }

        return null;
    }
}
