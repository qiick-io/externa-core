<?php

declare(strict_types=1);

namespace App\Http\Requests\Collections;

use App\Http\Requests\Concerns\AuthorizesCollectionRouteAccessTrait;
use App\Services\Collections\LivePreviewUrlBuilderService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

/**
 * Validates the Live Preview link options: workspace version, locale and `as_of` instant.
 *
 * `as_of` is only length-checked here; the controller parses and bounds it.
 */
class BuildLivePreviewUrlRequest extends FormRequest
{
    use AuthorizesCollectionRouteAccessTrait;

    /**
     * Item readable by the actor (403 / 404), then a preview URL template must be configured.
     *
     * The missing-template answer (422 with a hint message) has always come before validation,
     * so it stays ahead of `rules()` instead of moving into the controller body.
     */
    public function authorize(): bool
    {
        $this->authorizeItemRead();

        if (app(LivePreviewUrlBuilderService::class)->templateFor($this->routeCollection()) === null) {
            throw new HttpResponseException(response()->json([
                'message' => 'Configure a Live Preview URL on this collection (or Project settings default).',
            ], 422));
        }

        return true;
    }

    /**
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return [
            'version' => ['nullable', 'string', 'in:draft,published'],
            'locale' => ['nullable', 'string', 'max:16'],
            'as_of' => ['nullable', 'string', 'max:64'],
        ];
    }
}
