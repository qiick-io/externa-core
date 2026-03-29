<?php

namespace App\Http\Requests\Collections;

use App\Models\Collection;
use App\Services\Collections\CollectionItemDataRuleBuilder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class UpsertSingletonItemRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        /** @var Collection $collection */
        $collection = $this->route('collection');

        abort_unless($collection->is_singleton, 404);

        $creating = $collection->items()->doesntExist();

        return app(CollectionItemDataRuleBuilder::class)->rules($collection, $creating);
    }

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
