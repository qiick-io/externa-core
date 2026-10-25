<?php

namespace App\Http\Requests\Collections;

use App\Enums\PermissionEnum;
use App\Http\Requests\Concerns\AuthorizesWithPermissionTrait;
use App\Models\Collection;
use App\Services\Collections\CollectionItemDataRuleBuilder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * Validates updating an existing content collection item.
 */
class UpdateCollectionItemRequest extends FormRequest
{
    use AuthorizesWithPermissionTrait;

    /**
     * Authorization is enforced by collection route middleware.
     */
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
        /** @var Collection $collection */
        $collection = $this->route('collection');
        $item = $this->route('item');
        $excludeItemId = $item?->id;

        $base = [
            'version' => ['sometimes', 'string', Rule::in(['published', 'draft'])],
            'save_action' => ['sometimes', 'string', Rule::in(['stay', 'create_new', 'copy'])],
            'expected_updated_at' => ['sometimes', 'nullable', 'date'],
            // Kanban DnD: write group field to published (+ order), even when versioning is on.
            'board_move' => ['sometimes', 'boolean'],
            // Calendar DnD: write date field to published, even when versioning is on.
            'calendar_move' => ['sometimes', 'boolean'],
            'after_item_id' => ['sometimes', 'nullable', 'integer'],
            'before_item_id' => ['sometimes', 'nullable', 'integer'],
        ];

        // Move patches send only the dragged field — skip full-form required siblings (e.g. title).
        if ($this->boolean('board_move') || $this->boolean('calendar_move')) {
            return [
                ...$base,
                'data' => ['required', 'array', 'min:1'],
                'data.*' => ['nullable'],
            ];
        }

        return [
            ...$base,
            ...app(CollectionItemDataRuleBuilder::class)->rules(
                $collection,
                false,
                $excludeItemId,
                is_array($this->input('data')) ? $this->input('data') : [],
            ),
        ];
    }

    /**
     * Attach after-validation hooks for collection item data constraints.
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            /** @var Collection $collection */
            $collection = $this->route('collection');
            $data = $this->input('data');
            if (! is_array($data)) {
                return;
            }
            app(CollectionItemDataRuleBuilder::class)->assertKnownKeysOnly($collection, $data);
        });
    }
}
