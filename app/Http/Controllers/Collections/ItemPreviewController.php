<?php

declare(strict_types=1);

namespace App\Http\Controllers\Collections;

use App\Http\Controllers\Controller;
use App\Http\Requests\Collections\BuildLivePreviewUrlRequest;
use App\Http\Requests\Collections\PreviewCollectionItemAsRoleRequest;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\User;
use App\Services\Collections\ItemRolePreviewService;
use App\Services\Collections\LivePreviewAsOfResolverService;
use App\Services\Collections\LivePreviewUrlBuilderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;

/**
 * JSON endpoints of the item editor's previews: the item as a role (or the public)
 * sees it, and the signed Live Preview frontend URL. Authorization is in the FormRequests.
 */
class ItemPreviewController extends Controller
{
    public function __construct(
        private ItemRolePreviewService $itemRolePreviewService,
        private LivePreviewUrlBuilderService $livePreviewUrlBuilder,
    ) {}

    /**
     * Preview item field data as seen by a role (including public).
     */
    public function previewAsRole(PreviewCollectionItemAsRoleRequest $request, Collection $collection, CollectionItem $item): JsonResponse
    {
        $validated = $request->validated();

        $asPublic = (bool) ($validated['as_public'] ?? false);
        if (! $asPublic && empty($validated['role_id'])) {
            return response()->json(['message' => 'role_id or as_public is required.'], 422);
        }

        $role = $this->itemRolePreviewService->resolveRole(
            isset($validated['role_id']) ? (int) $validated['role_id'] : null,
            $asPublic,
        );

        $item->loadMissing(['collection.fields', 'fieldValues']);

        return response()->json(
            $this->itemRolePreviewService->preview($request, $collection, $item, $role),
        );
    }

    /**
     * Build a Live Preview frontend URL (signed token; no API key in the link).
     */
    public function livePreviewUrl(BuildLivePreviewUrlRequest $request, Collection $collection, CollectionItem $item): JsonResponse
    {
        $validated = $request->validated();

        $version = (string) ($validated['version'] ?? 'published');
        $locale = isset($validated['locale']) && is_string($validated['locale']) && $validated['locale'] !== ''
            ? $validated['locale']
            : null;

        $asOf = null;
        $asOfRaw = isset($validated['as_of']) && is_string($validated['as_of'])
            ? trim($validated['as_of'])
            : '';
        if ($asOfRaw !== '') {
            try {
                $asOf = app(LivePreviewAsOfResolverService::class)->parseBounded($asOfRaw);
            } catch (InvalidArgumentException $exception) {
                throw ValidationException::withMessages([
                    'as_of' => [$exception->getMessage()],
                ]);
            }
        }

        $user = $request->user();
        abort_unless($user instanceof User, 401);

        try {
            $built = $this->livePreviewUrlBuilder->build($collection, $item, $version, $locale, $user, $asOf);
        } catch (InvalidArgumentException $exception) {
            throw ValidationException::withMessages([
                'as_of' => [$exception->getMessage()],
            ]);
        }

        return response()->json($built);
    }
}
