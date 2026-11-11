<?php

declare(strict_types=1);

namespace App\Http\Requests\Collections;

use App\Http\Requests\Concerns\AuthorizesCollectionRouteAccessTrait;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates rejecting a draft in review: the reviewer must explain why (`rejection_note`).
 */
class RejectCollectionItemRequest extends FormRequest
{
    use AuthorizesCollectionRouteAccessTrait;

    /**
     * Item writable by the actor (403 / 404).
     */
    public function authorize(): bool
    {
        $this->authorizeItemWrite();

        return true;
    }

    /**
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return [
            'rejection_note' => ['required', 'string', 'max:5000'],
        ];
    }
}
