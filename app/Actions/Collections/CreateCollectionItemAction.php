<?php

declare(strict_types=1);

namespace App\Actions\Collections;

use App\Data\Collections\CollectionItemWriteData;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Services\Api\CollectionPermissionEnforcer;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemDataRuleBuilder;
use App\Services\Collections\CollectionItemValuesWriter;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

/**
 * Single create path for web, API, GraphQL, AI, and import surfaces.
 */
final class CreateCollectionItemAction
{
    public function __construct(
        private CollectionItemDataNormalizer $normalizer,
        private CollectionItemDataRuleBuilder $ruleBuilder,
        private CollectionItemValuesWriter $writer,
        private CollectionPermissionEnforcer $permissionEnforcer,
    ) {}

    /**
     * Validate (optional), normalize, and persist a new item inside a transaction.
     *
     * @throws ValidationException
     */
    public function execute(CollectionItemWriteData $write): CollectionItem
    {
        $collection = $write->collection;

        if ($collection->is_singleton && $collection->items()->exists()) {
            throw ValidationException::withMessages([
                'collection' => [__('A singleton collection already has its content item.')],
            ]);
        }

        $data = $write->data;

        if ($write->shouldAssertWritableFields && $write->request !== null) {
            $this->permissionEnforcer->assertWritableFields(
                $write->request,
                $collection,
                $data,
                'create',
            );
        }

        if ($write->shouldValidate) {
            $this->validatePayload($collection, $data);
        }

        return DB::transaction(function () use ($write, $collection, $data): CollectionItem {
            $normalized = $this->normalizer->normalize($collection, $data, true);
            $item = $collection->items()->create([]);
            $this->writer->sync(
                $item,
                $collection,
                $normalized,
                created: true,
                revisionMeta: $write->revisionMeta,
            );

            return $item->fresh() ?? $item;
        });
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function validatePayload(Collection $collection, array $data): void
    {
        $rules = $this->ruleBuilder->rules($collection, true, null, $data);
        $validator = Validator::make(['data' => $data], $rules);
        $validator->after(function () use ($collection, $data): void {
            $this->ruleBuilder->assertKnownKeysOnly($collection, $data);
        });
        $validator->validate();
    }
}
