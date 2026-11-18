<?php

declare(strict_types=1);

namespace App\Actions\Collections;

use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Services\Collections\CollectionFieldGroupService;
use App\Services\Collections\CollectionFieldRenamerService;

/**
 * Update a collection field definition through the renamer (which carries stored values
 * over when the name changes).
 *
 * Legacy `translatable = true` flags are coerced to false when the type cannot be
 * per-locale, and layout groups stay full width.
 */
final class UpdateCollectionFieldAction
{
    public function __construct(
        private CollectionFieldGroupService $groupService,
        private CollectionFieldRenamerService $renamer,
    ) {}

    /**
     * @param  array<string, mixed>  $validated  `UpdateFieldRequest::validated()`
     * @param  bool|null  $isTranslatableRequested  the request's `translatable` flag, null when absent (keep the current value)
     */
    public function execute(
        Collection $collection,
        CollectionField $field,
        array $validated,
        ?bool $isTranslatableRequested,
    ): void {
        $type = isset($validated['type'])
            ? ($validated['type'] instanceof FieldTypeEnum
                ? $validated['type']
                : FieldTypeEnum::from((string) $validated['type']))
            : $field->type;

        $translatable = $isTranslatableRequested ?? $field->translatable;

        if (! $type->isTranslatableSupported()) {
            $translatable = false;
        }

        if (isset($validated['settings']) && is_array($validated['settings'])) {
            $validated['settings'] = $this->groupService->forceFullWidthForGroup($type, $validated['settings']);
        }

        $this->renamer->update($collection, $field, [
            ...$validated,
            'translatable' => $translatable,
        ]);
    }
}
