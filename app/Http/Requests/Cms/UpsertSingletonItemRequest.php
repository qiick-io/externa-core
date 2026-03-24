<?php

namespace App\Http\Requests\Cms;

use App\Models\ContentCollection;
use App\Services\Cms\ItemDataRuleBuilder;
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
        /** @var ContentCollection $collection */
        $collection = $this->route('collection');

        abort_unless($collection->is_singleton, 404);

        $creating = $collection->items()->doesntExist();

        return app(ItemDataRuleBuilder::class)->rules($collection, $creating);
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            /** @var ContentCollection $collection */
            $collection = $this->route('collection');
            $data = $this->input('data');
            if (! is_array($data)) {
                return;
            }
            app(ItemDataRuleBuilder::class)->assertKnownKeysOnly($collection, $data);
        });
    }
}
