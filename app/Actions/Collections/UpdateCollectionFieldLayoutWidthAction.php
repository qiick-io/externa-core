<?php

declare(strict_types=1);

namespace App\Actions\Collections;

use App\Models\CollectionField;

/**
 * Set a field's `settings.layout_width`; layout groups are always full width.
 */
final class UpdateCollectionFieldLayoutWidthAction
{
    public function execute(CollectionField $field, mixed $width): void
    {
        $settings = $field->settings ?? [];

        if ($field->type->isLayoutGroup()) {
            $width = 'full';
        }

        $settings['layout_width'] = $width;
        $field->update(['settings' => $settings]);
    }
}
