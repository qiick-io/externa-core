<?php

declare(strict_types=1);

namespace App\Actions\Collections;

use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Services\Collections\CollectionFieldGroupService;

/**
 * Create a field on a collection.
 *
 * Layout groups are always full width, and new Accordion / Tabs chrome gets empty Raw
 * panels seeded. A leaf next to an Accordion / Tabs may nest directly (no auto-wrap on create).
 */
final class CreateCollectionFieldAction
{
    public function __construct(
        private CollectionFieldGroupService $groupService,
    ) {}

    /**
     * @param  array<string, mixed>  $validated  `StoreFieldRequest::validated()`
     * @param  bool  $isTranslatableRequested  the request's `translatable` flag; ignored when the type cannot be per-locale
     */
    public function execute(Collection $collection, array $validated, bool $isTranslatableRequested): CollectionField
    {
        $type = $validated['type'] instanceof FieldTypeEnum
            ? $validated['type']
            : FieldTypeEnum::from((string) $validated['type']);

        if (isset($validated['settings']) && is_array($validated['settings'])) {
            $validated['settings'] = $this->groupService->forceFullWidthForGroup($type, $validated['settings']);
        } elseif ($type->isLayoutGroup()) {
            $validated['settings'] = ['layout_width' => 'full'];
        }

        /** @var CollectionField $field */
        $field = $collection->fields()->create([
            ...$validated,
            'translatable' => $type->isTranslatableSupported() && $isTranslatableRequested,
        ]);

        $this->groupService->seedDefaultPanelSections($collection, $field);

        return $field;
    }
}
