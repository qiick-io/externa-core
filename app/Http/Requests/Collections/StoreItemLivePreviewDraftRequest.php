<?php

declare(strict_types=1);

namespace App\Http\Requests\Collections;

use App\Enums\CollectionPermissionActionEnum;
use App\Enums\PermissionEnum;
use App\Http\Requests\Concerns\AuthorizesCollectionRouteAccessTrait;
use App\Http\Requests\Concerns\AuthorizesWithPermissionTrait;
use App\Services\Collections\CollectionItemDataRuleBuilderService;
use App\Services\Collections\LivePreviewUrlBuilderService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Validation\Validator;

/**
 * Validates the unsaved create-form payload sent to Live Preview before the first save.
 *
 * Authorization matches {@see StoreCollectionItemRequest} (create permission and collection create
 * grant). Validation keeps every type, format, length, option and unknown-key rule of a create save
 * but drops the presence rules: previewing a half-filled form is the point, so empty required fields
 * stay absent (or take their default) in the stashed payload. Saving still enforces them.
 */
class StoreItemLivePreviewDraftRequest extends FormRequest
{
    use AuthorizesCollectionRouteAccessTrait;
    use AuthorizesWithPermissionTrait;

    /**
     * Create permission and collection create grant (403), then a preview URL template (422).
     */
    public function authorize(): bool
    {
        $this->authorizePermission(PermissionEnum::CanCreateCollections->value);
        $this->authorizeCollectionAction(CollectionPermissionActionEnum::Create);

        if (app(LivePreviewUrlBuilderService::class)->templateFor($this->routeCollection()) === null) {
            throw new HttpResponseException(response()->json([
                'message' => 'Configure a Live Preview URL on this collection (or Project settings default).',
            ], 422));
        }

        return true;
    }

    /**
     * Create-save rules without presence rules ({@see CollectionItemDataRuleBuilderService::withoutRequiredRules()}).
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'locale' => ['nullable', 'string', 'max:16'],
            ...app(CollectionItemDataRuleBuilderService::class)->withoutRequiredRules()->rules(
                $this->routeCollection(),
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
        $validator->after(function (): void {
            $data = $this->input('data');
            if (! is_array($data)) {
                return;
            }

            app(CollectionItemDataRuleBuilderService::class)->assertKnownKeysOnly($this->routeCollection(), $data);
        });
    }
}
