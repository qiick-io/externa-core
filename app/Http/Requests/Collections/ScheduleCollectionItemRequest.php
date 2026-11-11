<?php

declare(strict_types=1);

namespace App\Http\Requests\Collections;

use App\Http\Requests\Concerns\AuthorizesCollectionRouteAccessTrait;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates scheduling (or clearing) the publish / unpublish times of a versioned item.
 *
 * Whether unpublish must follow publish depends on the workspace version, so the controller checks it.
 */
class ScheduleCollectionItemRequest extends FormRequest
{
    use AuthorizesCollectionRouteAccessTrait;

    /**
     * Item writable by the actor (403 / 404), then the collection must be versioned (422).
     *
     * The versioning check has always answered before validation, so it stays ahead of `rules()`.
     */
    public function authorize(): bool
    {
        $this->authorizeItemWrite();
        abort_unless($this->routeCollection()->versioning, 422);

        return true;
    }

    /**
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return [
            'publish_at' => ['nullable', 'date'],
            'unpublish_at' => ['nullable', 'date'],
            'clear' => ['sometimes', 'boolean'],
        ];
    }
}
