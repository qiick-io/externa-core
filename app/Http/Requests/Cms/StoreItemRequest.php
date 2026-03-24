<?php

namespace App\Http\Requests\Cms;

use App\Models\ContentCollection;
use App\Services\Cms\ItemDataRuleBuilder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class StoreItemRequest extends FormRequest
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

        return app(ItemDataRuleBuilder::class)->rules($collection, true);
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
