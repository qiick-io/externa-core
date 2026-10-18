<?php

namespace App\Http\Requests\Collections;

use App\Enums\FieldTypeEnum;
use App\Enums\PermissionEnum;
use App\Http\Requests\Concerns\AuthorizesWithPermission;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Services\Collections\CollectionListColumnsNormalizer;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates user-scoped collection list column preferences.
 */
class UpdateCollectionListColumnsRequest extends FormRequest
{
    use AuthorizesWithPermission;

    public function authorize(): bool
    {
        $this->authorizePermission(PermissionEnum::CanEditCollections->value);

        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'columns' => ['required', 'array'],
            'columns.*' => ['string', 'max:128'],
            'aligns' => ['sometimes', 'array'],
            'aligns.*' => ['nullable', 'string', 'max:16'],
            'layout' => ['sometimes', 'nullable', 'string', 'in:table,kanban,calendar'],
            'kanban_field' => ['sometimes', 'nullable', 'string', 'max:64'],
            'calendar_field' => ['sometimes', 'nullable', 'string', 'max:64'],
        ];
    }

    protected function passedValidation(): void
    {
        /** @var Collection $collection */
        $collection = $this->route('collection');

        $normalized = app(CollectionListColumnsNormalizer::class)
            ->normalize($this->input('columns'), $collection);

        $allowed = array_flip($normalized);
        $aligns = [];
        foreach ($this->input('aligns', []) as $path => $align) {
            if (! is_string($path) || ! isset($allowed[$path])) {
                continue;
            }

            if (! in_array($align, ['left', 'center', 'right'], true)) {
                continue;
            }

            $aligns[$path] = $align;
        }

        $collection->loadMissing(['fields' => fn ($q) => $q->ordered()]);
        $fields = $collection->fields ?? collect();

        $kanbanField = $this->input('kanban_field');
        $kanbanField = is_string($kanbanField) && $kanbanField !== ''
            ? $kanbanField
            : null;
        if ($kanbanField !== null) {
            /** @var CollectionField|null $field */
            $field = $fields->firstWhere('name', $kanbanField);
            if (
                $field === null
                || ! in_array($field->type, [FieldTypeEnum::Select, FieldTypeEnum::RadioGroup], true)
            ) {
                $kanbanField = null;
            }
        }

        $calendarField = $this->input('calendar_field');
        $calendarField = is_string($calendarField) && $calendarField !== ''
            ? $calendarField
            : null;
        if ($calendarField !== null) {
            /** @var CollectionField|null $field */
            $field = $fields->firstWhere('name', $calendarField);
            if ($field === null || $field->type !== FieldTypeEnum::Date) {
                $calendarField = null;
            }
        }

        $layout = $this->input('layout');
        $layout = in_array($layout, ['table', 'kanban', 'calendar'], true) ? $layout : null;

        $this->merge([
            'columns' => $normalized,
            'aligns' => $aligns,
            'layout' => $layout,
            'kanban_field' => $kanbanField,
            'calendar_field' => $calendarField,
        ]);
    }
}
