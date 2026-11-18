<?php

declare(strict_types=1);

namespace App\Http\Controllers\Collections;

use App\Http\Controllers\Controller;
use App\Http\Requests\Collections\StoreItemLivePreviewDraftRequest;
use App\Models\Collection;
use App\Models\User;
use App\Services\Collections\LivePreviewUnsavedDraftService;
use App\Services\Collections\LivePreviewUrlBuilderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Live Preview for the create form: stashes the unsaved payload and returns a signed preview URL,
 * and revokes that stash when the editor leaves the form. Saving the item revokes it too
 * ({@see ItemController::store()}).
 */
class ItemLivePreviewDraftController extends Controller
{
    public function __construct(
        private LivePreviewUnsavedDraftService $unsavedDrafts,
        private LivePreviewUrlBuilderService $livePreviewUrlBuilder,
    ) {}

    /**
     * Stash the validated create-form data (no item row) and build its Live Preview URL.
     */
    public function store(StoreItemLivePreviewDraftRequest $request, Collection $collection): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $validatedData = $request->validated('data') ?? [];
        $locale = $request->validated('locale');

        $unsavedDraftId = $this->unsavedDrafts->stash($request, $collection, is_array($validatedData) ? $validatedData : []);

        return response()->json($this->livePreviewUrlBuilder->buildForUnsavedDraft(
            $collection,
            $unsavedDraftId,
            is_string($locale) && $locale !== '' ? $locale : null,
            $user,
        ));
    }

    /**
     * Revoke the actor's unsaved preview for this collection (create form cancelled or left).
     *
     * Idempotent: revoking a missing or expired stash is a no-op.
     */
    public function destroy(Request $request, Collection $collection): Response
    {
        /** @var User $user */
        $user = $request->user();
        $this->unsavedDrafts->forget($user, $collection);

        return response()->noContent();
    }
}
