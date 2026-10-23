<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\CollectionItemResource;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\User;
use App\Services\Api\CollectionPermissionEnforcer;
use App\Services\Collections\LivePreviewToken;
use App\Services\Collections\LivePreviewUrlBuilder;
use App\Support\Collections\CollectionLocaleResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Public CMS API receiver for Live Preview signed tokens (no API key).
 *
 * Authorization is the issuing user's collection Read / item_filter / field ACL.
 */
class LivePreviewController extends Controller
{
    public function __invoke(
        Request $request,
        LivePreviewToken $tokens,
        LivePreviewUrlBuilder $urlBuilder,
        CollectionLocaleResolver $locales,
        CollectionPermissionEnforcer $permissionEnforcer,
    ): JsonResponse {
        $token = (string) $request->query('token', '');
        if ($token === '') {
            return response()->json(['message' => 'token query parameter is required.'], 422);
        }

        $claims = $tokens->verify($token);
        if ($claims === null) {
            return response()->json(['message' => 'Invalid or expired preview token.'], 403);
        }

        $user = User::query()->find($claims['user_id']);
        if ($user === null || ! $user->is_active) {
            return response()->json(['message' => 'Invalid or expired preview token.'], 403);
        }

        $collection = Collection::query()->find($claims['collection_id']);
        $item = CollectionItem::query()->find($claims['item_id']);

        if ($collection === null || $item === null || $item->collection_id !== $collection->id) {
            return response()->json(['message' => 'Preview target not found.'], 404);
        }

        // Bind the minting user so resolveRules / stripData / includes use their ACL.
        $request->setUserResolver(static fn (): User => $user);

        if (! $permissionEnforcer->isCollectionReadable($request, $collection)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        if (! $permissionEnforcer->isItemReadable($request, $collection, $item)) {
            return response()->json(['message' => 'Preview target not found.'], 404);
        }

        $version = $claims['version'];

        if ($claims['content_hash'] !== null
            && ! hash_equals($claims['content_hash'], $urlBuilder->contentHash($item, $version))) {
            return response()->json(['message' => 'Invalid or expired preview token.'], 403);
        }

        $item->loadMissing(['collection.fields', 'fieldValues']);

        $overrideLocale = $claims['locale'];
        $locales->assertRequestedLocaleAllowed($overrideLocale);
        $locale = $locales->resolve($overrideLocale);

        if ($version === 'draft' && $collection->versioning && is_array($item->draft_data)) {
            $data = $permissionEnforcer->stripData($request, $collection, $item->draft_data);
            $payload = [
                'id' => $item->id,
                'collection_id' => $item->collection_id,
                'data' => $data,
                'created_at' => $item->created_at?->toIso8601String(),
                'updated_at' => $item->updated_at?->toIso8601String(),
            ];
        } else {
            if ($overrideLocale !== null) {
                $request->query->set('locale', $overrideLocale);
            }
            $payload = (new CollectionItemResource($item))->toArray($request);
        }

        return response()->json([
            'data' => $payload,
            'meta' => [
                'preview' => true,
                'version' => $version,
                'locale' => $locale,
                'expires_at' => gmdate('Y-m-d\TH:i:s\Z', $claims['exp']),
            ],
        ]);
    }
}
