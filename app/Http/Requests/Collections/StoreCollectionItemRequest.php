<?php

namespace App\Http\Requests\Collections;

use App\Models\Collection;
use App\Services\Collections\CollectionItemDataRuleBuilder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * Validates creating a new item in a content collection.
 */
class StoreCollectionItemRequest extends FormRequest
{
    /**
     * Authorization is enforced by collection route middleware.
     *
     * @return bool
     */
    public function authorize(): bool
    {
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

        return app(CollectionItemDataRuleBuilder::class)->rules($collection, true);
    }

    /**
     * Reject unknown field keys after base validation completes.
     *
     * @return void
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
