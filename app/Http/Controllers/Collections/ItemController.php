<?php

declare(strict_types=1);

namespace App\Http\Controllers\Collections;

use App\Actions\Collections\CreateCollectionItemAction;
use App\Actions\Collections\MoveCollectionItemAction;
use App\Actions\Collections\UpdateCollectionItemAction;
use App\Data\Collections\CollectionItemWriteData;
use App\Enums\PermissionEnum;
use App\Http\Controllers\Controller;
use App\Http\Requests\Collections\StoreCollectionItemRequest;
use App\Http\Requests\Collections\UpdateCollectionItemRequest;
use App\Http\Requests\Concerns\ValidatesListPerPageTrait;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\User;
use App\Services\Api\CollectionPermissionEnforcerService;
use App\Services\Authorization\EffectivePermissionResolverService;
use App\Services\Collections\CollectionItemFormPropsService;
use App\Services\Collections\CollectionItemFormSaveService;
use App\Services\Collections\LivePreviewUnsavedDraftService;
use App\Services\Http\SafeReturnUrlService;
use App\Traits\AssertsItemBelongsToCollectionTrait;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The item editor of non-singleton collections: create form, store, edit form, update and
 * soft delete. The list page is `ItemListController`, the trash `ItemTrashController`, the
 * editor's previews `ItemPreviewController` and its relational pickers `ItemFieldOptionController`.
 */
class ItemController extends Controller
{
    use AssertsItemBelongsToCollectionTrait;
    use ValidatesListPerPageTrait;

    public function __construct(
        private CreateCollectionItemAction $createCollectionItemAction,
        private UpdateCollectionItemAction $updateCollectionItemAction,
        private MoveCollectionItemAction $moveCollectionItemAction,
        private CollectionPermissionEnforcerService $permissionEnforcer,
        private LivePreviewUnsavedDraftService $unsavedLivePreviewDrafts,
        private CollectionItemFormPropsService $formProps,
        private CollectionItemFormSaveService $formSave,
        private EffectivePermissionResolverService $permissionResolver,
    ) {}

    /**
     * Render the create-item form or redirect singleton collections.
     */
    public function newItem(Request $request, Collection $collection): Response|RedirectResponse
    {
        Gate::forUser($request->user())->authorize('createItems', $collection);

        if ($collection->is_singleton && $collection->items()->exists()) {
            abort(422, __('A singleton collection already has its content item.'));
        }

        if ($collection->is_singleton) {
            return redirect()->route('collections.show', $collection);
        }

        $collection->load(['fields' => fn ($q) => $q->ordered()]);

        return Inertia::render('collections/items/form', $this->formProps->createProps($request, $collection));
    }

    /**
     * Create a collection item from validated field data.
     *
     * Revokes the actor's unsaved create-form Live Preview for the collection: once the item exists,
     * its own (item-bound) preview takes over.
     */
    public function store(StoreCollectionItemRequest $request, Collection $collection): RedirectResponse
    {
        Gate::forUser($request->user())->authorize('createItems', $collection);

        if ($collection->is_singleton && $collection->items()->exists()) {
            abort(422, __('A singleton collection already has its content item.'));
        }

        $data = $request->validated('data') ?? [];
        if (! is_array($data)) {
            $data = [];
        }
        $this->permissionEnforcer->assertWritableFields($request, $collection, $data, 'create');

        $item = $this->persistNewItem($collection, $data);

        $user = $request->user();
        if ($user instanceof User) {
            $this->unsavedLivePreviewDrafts->forget($user, $collection);
        }

        return $this->redirectAfterItemSave(
            $collection,
            $item,
            $this->itemSaveAction($request),
            __('Item created.'),
        );
    }

    /**
     * Show the item editor or redirect singleton collections.
     */
    public function show(Request $request, Collection $collection, CollectionItem $item): Response|RedirectResponse
    {
        Gate::forUser($request->user())->authorize('viewItems', $collection);
        $this->assertItemBelongsToCollection($collection, $item);
        abort_unless(Gate::forUser($request->user())->allows('view', [$item, $collection]), 404);

        if ($collection->is_singleton) {
            return redirect()->route('collections.show', $collection);
        }

        $activityPerPage = $this->validatedListPerPage($request, default: 10);

        return Inertia::render(
            'collections/items/form',
            $this->formProps->editProps($request, $collection, $item, $activityPerPage),
        );
    }

    /**
     * Update a collection item while preserving readonly field values.
     * When collection versioning is on and version=draft, writes draft_data only.
     * Kanban board_move / calendar_move write the moved field to the published values, never to a draft.
     */
    public function update(UpdateCollectionItemRequest $request, Collection $collection, CollectionItem $item): RedirectResponse
    {
        Gate::forUser($request->user())->authorize('updateItems', $collection);
        $this->assertItemBelongsToCollection($collection, $item);
        Gate::forUser($request->user())->authorize('update', [$item, $collection]);

        $this->formSave->assertUnchangedSince($item, $request->validated('expected_updated_at'));

        if ($request->boolean('board_move')) {
            $item = $this->moveCollectionItemAction->execute(
                $request,
                $collection,
                $item,
                $request->validated('data') ?? [],
                MoveCollectionItemAction::SOURCE_BOARD,
                afterItemId: $request->validated('after_item_id') !== null
                    ? (int) $request->validated('after_item_id')
                    : null,
                beforeItemId: $request->validated('before_item_id') !== null
                    ? (int) $request->validated('before_item_id')
                    : null,
            );

            return $this->redirectAfterItemSave(
                $collection,
                $item,
                $this->itemSaveAction($request),
                __('Item updated.'),
            );
        }

        if ($request->boolean('calendar_move')) {
            $item = $this->moveCollectionItemAction->execute(
                $request,
                $collection,
                $item,
                $request->validated('data') ?? [],
                MoveCollectionItemAction::SOURCE_CALENDAR,
            );

            return $this->redirectAfterItemSave(
                $collection,
                $item,
                $this->itemSaveAction($request),
                __('Item updated.'),
            );
        }

        $version = (string) ($request->validated('version') ?? 'published');
        if (! $collection->versioning) {
            $version = 'published';
        }

        // The published workspace is read-only when versioning is enabled.
        if ($collection->versioning && $version === 'published') {
            return redirect()
                ->route('collections.items.show', [
                    'collection' => $collection,
                    'item' => $item,
                    'version' => 'published',
                ])
                ->with('error', __('Switch to Draft to edit, then Publish.'));
        }

        $data = $this->formSave->mergeFormInput($request, $collection, $item, $version, $request->validated('data') ?? []);

        $action = $this->itemSaveAction($request);

        if ($action === 'copy' && ! $collection->is_singleton) {
            // A copy is a new item: the same gates as store (permission incl. groups + Create grant).
            $user = $request->user();
            abort_unless(
                $user instanceof User
                    && $this->permissionResolver->hasPermission($user, PermissionEnum::CanCreateCollections->value),
                403,
            );
            Gate::forUser($user)->authorize('createItems', $collection);

            $copy = $this->persistNewItem($collection, $data);

            return $this->redirectAfterItemSave(
                $collection,
                $copy,
                'stay',
                __('Item created.'),
            );
        }

        $scheduleWarningDate = $this->formSave->scheduleWarningDate($collection, $item, $version);

        $item = $this->updateCollectionItemAction->execute(new CollectionItemWriteData(
            collection: $collection,
            data: $data,
            item: $item,
            creating: false,
            version: $version === 'draft' ? 'draft' : 'published',
            shouldValidate: false,
            shouldMergeIncoming: false,
            shouldEnforceVersioningGuard: false,
        ));

        if ($version === 'draft') {
            $success = $scheduleWarningDate !== null
                ? __('Draft saved. Approval was reset; the scheduled publish on :date will not run until the item is approved again.', [
                    'date' => $scheduleWarningDate,
                ])
                : __('Draft saved.');

            return $this->redirectAfterItemSave(
                $collection,
                $item,
                $action,
                $success,
                draft: true,
            );
        }

        return $this->redirectAfterItemSave(
            $collection,
            $item,
            $action,
            __('Item updated.'),
        );
    }

    /**
     * Soft-delete a collection item.
     */
    public function destroy(Request $request, Collection $collection, CollectionItem $item): RedirectResponse
    {
        Gate::forUser($request->user())->authorize('deleteItems', $collection);
        $this->assertItemBelongsToCollection($collection, $item);
        Gate::forUser($request->user())->authorize('delete', [$item, $collection]);

        $item->delete();

        return redirect()->route('collections.items.index', $collection)
            ->with('success', __('Item deleted.'));
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function persistNewItem(Collection $collection, array $data): CollectionItem
    {
        return $this->createCollectionItemAction->execute(new CollectionItemWriteData(
            collection: $collection,
            data: $data,
            creating: true,
            shouldValidate: false,
        ));
    }

    private function itemSaveAction(Request $request): string
    {
        $action = (string) $request->input('save_action', 'stay');

        return in_array($action, ['stay', 'create_new', 'copy'], true) ? $action : 'stay';
    }

    private function redirectAfterItemSave(
        Collection $collection,
        CollectionItem $item,
        string $action,
        string $success,
        bool $draft = false,
    ): RedirectResponse {
        if ($action === 'create_new' && ! $collection->is_singleton) {
            return redirect()
                ->route('collections.items.new', $collection)
                ->with('success', $success);
        }

        if ($action === 'stay') {
            $return = SafeReturnUrlService::from(request()->input('return'));
            if ($return !== null) {
                return redirect()->to($return)->with('success', $success);
            }
        }

        $parameters = [
            'collection' => $collection,
            'item' => $item,
        ];

        if ($draft) {
            $parameters['version'] = 'draft';
        }

        return redirect()
            ->route('collections.items.show', $parameters)
            ->with('success', $success);
    }
}
