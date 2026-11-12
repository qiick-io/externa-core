<?php

declare(strict_types=1);

namespace App\Actions\Collections;

use App\Models\Collection;
use App\Models\CollectionField;
use App\Services\Collections\CollectionFieldGroupService;

/**
 * Delete a collection field; deleting a layout group moves its children back to the top level.
 */
final class DeleteCollectionFieldAction
{
    public function __construct(
        private CollectionFieldGroupService $groupService,
    ) {}

    public function execute(Collection $collection, CollectionField $field): void
    {
        $wasGroup = $field->type->isLayoutGroup();
        $groupName = $field->name;

        $field->delete();

        if ($wasGroup) {
            $this->groupService->ungroupChildren($collection, $groupName);
        }
    }
}
