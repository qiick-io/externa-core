<?php

declare(strict_types=1);

namespace App\Services\Collections;

use App\Models\Collection;
use App\Models\User;
use App\Services\Api\CollectionPermissionEnforcerService;
use App\Services\Api\CollectionPermissionRulesService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * Short-lived stash of an unsaved create-form payload so Live Preview works before the first save.
 *
 * No item row is created: the normalized payload lives in the cache for the Live Preview token TTL,
 * under one key per user and collection. Each stash gets a fresh random id that the token carries,
 * so a newer preview (or a save, or leaving the form) invalidates every older link for that form.
 *
 * ponytail: one entry per user + collection, so two create tabs of the same collection share it
 * and the newest preview wins; key by a per-tab id if editors need parallel create previews.
 */
class LivePreviewUnsavedDraftService
{
    public const DRAFT_ID_LENGTH = 40;

    public function __construct(
        private readonly CollectionItemDataNormalizerService $normalizer,
        private readonly CollectionPermissionEnforcerService $permissionEnforcer,
        private readonly CollectionPermissionRulesService $rulesService,
    ) {}

    /**
     * Strip the fields the actor may not create, normalize like a create save, and stash the result.
     *
     * Side effect: replaces the actor's previous stash for this collection (cache write).
     *
     * @param  array<string, mixed>  $validatedData  `data` after the create-form validation rules
     * @return string The random draft id the preview token claims
     */
    public function stash(Request $request, Collection $collection, array $validatedData): string
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $rules = $this->permissionEnforcer->resolveRules($request, $collection);
        if ($rules !== null) {
            $deniedFieldNames = $this->rulesService->deniedWriteFields($rules, $validatedData, 'create');
            $validatedData = array_diff_key($validatedData, array_flip($deniedFieldNames));
        }

        $unsavedDraftId = Str::random(self::DRAFT_ID_LENGTH);

        Cache::put(
            $this->cacheKey((int) $user->id, (int) $collection->id),
            [
                'draft_id' => $unsavedDraftId,
                'data' => $this->normalizer->normalize($collection, $validatedData, true),
            ],
            LivePreviewUrlBuilderService::TTL_SECONDS,
        );

        return $unsavedDraftId;
    }

    /**
     * The stashed payload when the id still names the current stash of that user and collection.
     *
     * @return array<string, mixed>|null
     */
    public function find(int $userId, int $collectionId, string $unsavedDraftId): ?array
    {
        $entry = Cache::get($this->cacheKey($userId, $collectionId));

        if (
            ! is_array($entry)
            || ! is_string($entry['draft_id'] ?? null)
            || ! hash_equals($entry['draft_id'], $unsavedDraftId)
            || ! is_array($entry['data'] ?? null)
        ) {
            return null;
        }

        return $entry['data'];
    }

    /**
     * Revoke the stash (and so every outstanding unsaved-draft token) of a user's create form.
     */
    public function forget(User $user, Collection $collection): void
    {
        Cache::forget($this->cacheKey((int) $user->id, (int) $collection->id));
    }

    private function cacheKey(int $userId, int $collectionId): string
    {
        return 'live-preview:unsaved-draft:'.$userId.':'.$collectionId;
    }
}
