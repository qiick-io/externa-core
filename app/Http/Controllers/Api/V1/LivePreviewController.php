<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Enums\PermissionEnum;
use App\Http\Controllers\Controller;
use App\Http\Resources\CollectionItemResource;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\User;
use App\Services\Api\CollectionPermissionEnforcerService;
use App\Services\Api\CollectionPermissionRulesService;
use App\Services\Authorization\EffectivePermissionResolverService;
use App\Services\Collections\CollectionLocaleResolverService;
use App\Services\Collections\LivePreviewAsOfResolverService;
use App\Services\Collections\LivePreviewTokenService;
use App\Services\Collections\LivePreviewUnsavedDraftService;
use App\Services\Collections\LivePreviewUrlBuilderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Gate;

/**
 * Public CMS API receiver for Live Preview signed tokens (no API key).
 *
 * Authorization is the issuing user's collection Read / item_filter / field ACL. Unsaved create-form
 * tokens ({@see LivePreviewUnsavedDraftService}) also need the user's collection Create grant.
 */
class LivePreviewController extends Controller
{
    public function __invoke(
        Request $request,
        LivePreviewTokenService $tokens,
        LivePreviewUrlBuilderService $urlBuilder,
        LivePreviewAsOfResolverService $asOfResolver,
        CollectionLocaleResolverService $locales,
        CollectionPermissionEnforcerService $permissionEnforcer,
        LivePreviewUnsavedDraftService $unsavedDrafts,
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

        if ($claims['unsaved_draft_id'] !== null) {
            return $this->unsavedDraftResponse($request, $claims, $user, $unsavedDrafts, $locales, $permissionEnforcer);
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
        $asOf = $claims['as_of'] !== null
            ? Carbon::createFromTimestamp($claims['as_of'])
            : null;

        if ($claims['content_hash'] !== null
            && ! hash_equals($claims['content_hash'], $urlBuilder->contentHash($item, $version, $asOf))) {
            return response()->json(['message' => 'Invalid or expired preview token.'], 403);
        }

        $item->loadMissing(['collection.fields', 'fieldValues']);

        $overrideLocale = $claims['locale'];
        $locales->assertRequestedLocaleAllowed($overrideLocale);
        $locale = $locales->resolve($overrideLocale);

        if ($asOf !== null) {
            $resolution = $asOfResolver->resolve($item, $asOf);
            if (! $resolution['visible']) {
                return response()->json(['message' => 'Preview target not found.'], 404);
            }

            if ($resolution['use_draft'] && is_array($item->draft_data)) {
                $data = $permissionEnforcer->stripData($request, $collection, $item->draft_data);
                $payload = [
                    'id' => $item->id,
                    'collection_id' => $item->collection_id,
                    'data' => $data,
                    'created_at' => $item->created_at?->toIso8601String(),
                    'updated_at' => $item->updated_at?->toIso8601String(),
                    'published_at' => $asOf->utc()->toIso8601String(),
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
                    'as_of' => $asOf->utc()->format('Y-m-d\TH:i:s\Z'),
                    'source' => $resolution['use_draft'] ? 'draft_overlay' : 'published',
                ],
            ]);
        }

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
                'as_of' => null,
            ],
        ]);
    }

    /**
     * Resolve an unsaved create-form token to its stashed payload, shaped like a draft item without an id.
     *
     * A replaced, revoked or expired stash answers like any invalid token (403), so a token cannot
     * tell a caller whether the form was saved, left or previewed again.
     *
     * @param  array{collection_id: int, unsaved_draft_id: string|null, locale: string|null, exp: int}  $claims
     */
    private function unsavedDraftResponse(
        Request $request,
        array $claims,
        User $user,
        LivePreviewUnsavedDraftService $unsavedDrafts,
        CollectionLocaleResolverService $locales,
        CollectionPermissionEnforcerService $permissionEnforcer,
    ): JsonResponse {
        $collection = Collection::query()->find($claims['collection_id']);
        $stashedData = $collection === null
            ? null
            : $unsavedDrafts->find((int) $user->id, (int) $collection->id, (string) $claims['unsaved_draft_id']);

        if ($collection === null || $stashedData === null) {
            return response()->json(['message' => 'Invalid or expired preview token.'], 403);
        }

        $request->setUserResolver(static fn (): User => $user);

        // The same gates as minting (permission middleware + CollectionPolicy::createItems), re-checked
        // so a token stops working as soon as the editor loses the create access.
        if (
            ! $permissionEnforcer->isCollectionReadable($request, $collection)
            || ! app(EffectivePermissionResolverService::class)->hasPermission($user, PermissionEnum::CanCreateCollections->value)
            || Gate::forUser($user)->denies('createItems', $collection)
        ) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $rules = $permissionEnforcer->resolveRules($request, $collection);
        if ($rules === null || ! app(CollectionPermissionRulesService::class)->isMatchingMergedItem($rules, $stashedData)) {
            return response()->json(['message' => 'Preview target not found.'], 404);
        }

        $overrideLocale = $claims['locale'];
        $locales->assertRequestedLocaleAllowed($overrideLocale);

        return response()->json([
            'data' => [
                'id' => null,
                'collection_id' => $collection->id,
                'data' => $permissionEnforcer->stripData($request, $collection, $stashedData),
                'created_at' => null,
                'updated_at' => null,
            ],
            'meta' => [
                'preview' => true,
                'version' => 'draft',
                'locale' => $locales->resolve($overrideLocale),
                'expires_at' => gmdate('Y-m-d\TH:i:s\Z', $claims['exp']),
                'as_of' => null,
                'unsaved' => true,
            ],
        ]);
    }
}
