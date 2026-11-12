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
 * Authorization and validation match {@see StoreCollectionItemRequest}: the create permission,
 * the collection's create grant, the schema rules and the unknown-key check. A preview must never
 * accept data that saving the same form would reject.
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
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'locale' => ['nullable', 'string', 'max:16'],
            ...app(CollectionItemDataRuleBuilderService::class)->rules(
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
