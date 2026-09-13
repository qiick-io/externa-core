<?php

namespace App\Http\Requests\Collections;

use App\Enums\PermissionEnum;
use App\Http\Requests\Concerns\AuthorizesWithPermission;
use App\Models\Collection;
use App\Services\Collections\CollectionItemDataRuleBuilder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * Validates creating a new item in a content collection.
 */
class StoreCollectionItemRequest extends FormRequest
{
    use AuthorizesWithPermission;

    /**
     * Authorization is enforced by collection route middleware.
     */
    public function authorize(): bool
    {
        $this->authorizePermission(PermissionEnum::CanCreateCollections->value);

        return true;
    }

    /**
     * Build dynamic validation rules from the collection field schema.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        /** @var Collection $collection */
        $collection = $this->route('collection');

        return [
            'save_action' => ['sometimes', 'string', Rule::in(['stay', 'create_new', 'copy'])],
            ...app(CollectionItemDataRuleBuilder::class)->rules(
                $collection,
                true,
                null,
                is_array($this->input('data')) ? $this->input('data') : [],
            ),
        ];
    }

    /**
     * Reject unknown field keys after base validation completes.
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
