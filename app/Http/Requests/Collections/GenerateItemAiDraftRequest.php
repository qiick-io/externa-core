<?php

declare(strict_types=1);

namespace App\Http\Requests\Collections;

use App\Models\Collection;
use App\Policies\CollectionPolicy;
use App\Support\Collections\CollectionLocaleResolver;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/**
 * Validates an AI item draft request: a bounded brief and an enabled content locale.
 *
 * The `ai.draft` permission is the route's `permission:` middleware; here the user also needs
 * the collection's createItems or updateItems ability ({@see CollectionPolicy}),
 * because a draft is only useful to someone who can save it.
 */
class GenerateItemAiDraftRequest extends FormRequest
{
    public const int MAX_PROMPT_LENGTH = 2000;

    public function authorize(): bool
    {
        $collection = $this->route('collection');

        if (! $collection instanceof Collection) {
            return false;
        }

        $gate = Gate::forUser($this->user());

        return $gate->allows('createItems', $collection) || $gate->allows('updateItems', $collection);
    }

    /**
     * @return array<string, list<mixed>>
     */
    public function rules(): array
    {
        return [
            'prompt' => ['required', 'string', 'min:3', 'max:'.self::MAX_PROMPT_LENGTH],
            'locale' => ['required', 'string', Rule::in(app(CollectionLocaleResolver::class)->allowedLocales())],
        ];
    }
}
