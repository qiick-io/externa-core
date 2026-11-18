<?php

declare(strict_types=1);

namespace App\Actions\Collections;

use App\Models\CollectionField;

/**
 * Toggle whether a field is hidden on the item form (`settings.hidden_in_form`).
 */
final class ToggleCollectionFieldFormVisibilityAction
{
    /**
     * @return bool true when the field is now hidden
     */
    public function execute(CollectionField $field): bool
    {
        $settings = $field->settings ?? [];
        $willHide = ! $field->isHiddenInForm();
        $settings['hidden_in_form'] = $willHide;
        $field->update(['settings' => $settings]);

        return $willHide;
    }
}
