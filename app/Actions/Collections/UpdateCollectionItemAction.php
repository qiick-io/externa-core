<?php

declare(strict_types=1);

namespace App\Actions\Collections;

use App\Data\Collections\CollectionItemWriteData;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Services\Api\CollectionPermissionEnforcer;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemDataRuleBuilder;
use App\Services\Collections\CollectionItemRevisionRecorder;
use App\Services\Collections\CollectionItemValuesAssembler;
use App\Services\Collections\CollectionItemValuesWriter;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use RuntimeException;

/**
 * Single update path for web, API, GraphQL, AI, and import surfaces.
 *
 * When the collection has versioning and `$version === 'draft'`, writes `draft_data`
 * only. Published writes on versioned collections are rejected unless the guard is disabled
 * (board/calendar moves, promote, revision restore).
 */
final class UpdateCollectionItemAction
{
    public function __construct(
        private CollectionItemDataNormalizer $normalizer,
        private CollectionItemDataRuleBuilder $ruleBuilder,
        private CollectionItemValuesAssembler $assembler,
        private CollectionItemValuesWriter $writer,
        private CollectionItemRevisionRecorder $revisionRecorder,
        private CollectionPermissionEnforcer $permissionEnforcer,
    ) {}

    /**
     * Validate (optional), merge, and persist an update inside a transaction.
     *
     * @throws ValidationException
     */
    public function execute(CollectionItemWriteData $write): CollectionItem
    {
        $collection = $write->collection;
        $item = $write->item;

        if ($item === null) {
            throw new RuntimeException('UpdateCollectionItemAction requires an item.');
        }

        $version = $write->version;
        if (! $collection->versioning) {
            $version = 'published';
        }

        if (
            $write->shouldEnforceVersioningGuard
            && $collection->versioning
            && $version === 'published'
        ) {
            throw ValidationException::withMessages([
                'version' => [__('Switch to Draft to edit, then Publish.')],
            ]);
        }

        $data = $write->data;

        if ($write->shouldAssertWritableFields && $write->request !== null) {
            $this->permissionEnforcer->assertWritableFields(
                $write->request,
                $collection,
                $data,
                $write->writableMode,
            );
        }

        if ($write->shouldValidate) {
            $this->validatePayload($collection, $data, $item->id);
        }

        return DB::transaction(function () use ($write, $collection, $item, $version, $data): CollectionItem {
            $base = $version === 'draft' && is_array($item->draft_data)
                ? $item->draft_data
                : $this->assembler->assemble($item);

            $merged = $write->shouldMergeIncoming
                ? $this->normalizer->mergeIncoming($base, $data)
                : $data;

            $normalized = $this->normalizer->normalize($collection, $merged, false);

            if ($version === 'draft') {
                $item->draft_data = $normalized;

                if (
                    $collection->approvals_required
                    && in_array((string) $item->approval_status, ['approved', 'rejected', 'in_review'], true)
                ) {
                    $item->approval_status = 'draft';
                    $item->rejection_note = null;
                    $item->submitted_by = null;
                    $item->reviewed_by = null;
                    $item->reviewed_at = null;
                }

                $item->save();
                $this->revisionRecorder->record($item, $write->revisionMeta ?? [
                    'source' => 'draft',
                    'version' => 'draft',
                ], $normalized);

                return $item->fresh() ?? $item;
            }

            $this->writer->sync(
                $item,
                $collection,
                $normalized,
                created: false,
                revisionMeta: $write->revisionMeta,
            );

            return $item->fresh() ?? $item;
        });
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function validatePayload(Collection $collection, array $data, int $excludeItemId): void
    {
        $rules = $this->ruleBuilder->rules($collection, false, $excludeItemId, $data);
        $validator = Validator::make(['data' => $data], $rules);
        $validator->after(function () use ($collection, $data): void {
            $this->ruleBuilder->assertKnownKeysOnly($collection, $data);
        });
        $validator->validate();
    }
}
