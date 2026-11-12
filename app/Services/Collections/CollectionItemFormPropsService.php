<?php

declare(strict_types=1);

namespace App\Services\Collections;

use App\Http\Requests\Collections\PreviewCollectionItemAsRoleRequest;
use App\Http\Resources\Admin\ActivityLogResource;
use App\Http\Resources\CollectionItemResource;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\Role;
use App\Services\Ai\ItemDraftGeneratorService;
use App\Services\Api\CollectionPermissionEnforcerService;
use App\Services\Authorization\EffectivePermissionResolverService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Spatie\Activitylog\Models\Activity;

/**
 * Read side of the item editor: the `collections/items/form` page props for a new item
 * and for an existing one (published or draft workspace, activity log, workflow state).
 */
class CollectionItemFormPropsService
{
    public function __construct(
        private CollectionItemValuesAssemblerService $collectionItemValuesAssembler,
        private CollectionItemOptionsService $collectionItemOptionsService,
        private CollectionPermissionEnforcerService $permissionEnforcer,
        private LivePreviewUrlBuilderService $livePreviewUrlBuilder,
        private EffectivePermissionResolverService $permissionResolver,
        private ItemDraftGeneratorService $itemDraftGenerator,
    ) {}

    /**
     * Props of the create-item form. Expects the collection's fields to be loaded.
     *
     * @return array<string, mixed>
     */
    public function createProps(Request $request, Collection $collection): array
    {
        return [
            'collection' => $collection,
            'item' => null,
            'rawData' => [],
            'isNew' => true,
            'relatedCollections' => $this->collectionItemOptionsService->collectionsForSelect(),
            'fieldGrants' => $this->permissionEnforcer->fieldGrantsForForm($request, $collection),
            'previewRoles' => $this->previewRoles($request),
            'activityLogs' => null,
            'livePreviewConfigured' => $this->livePreviewUrlBuilder->templateFor($collection) !== null,
            'canUseAiDrafts' => $this->itemDraftGenerator->canDraftFor($request->user(), $collection),
        ];
    }

    /**
     * Props of the item editor for an existing item.
     *
     * `?version=draft|published` picks the workspace; collections without versioning always
     * show the published values, and the draft workspace falls back to them while no draft exists.
     *
     * @return array<string, mixed>
     */
    public function editProps(Request $request, Collection $collection, CollectionItem $item): array
    {
        $collection->load(['fields' => fn ($q) => $q->ordered()]);
        $item->load([
            'fieldValues',
            'userCreated:id,first_name,last_name,email',
            'userUpdated:id,first_name,last_name,email',
            'collection.fields',
        ]);

        $rawPublished = $this->collectionItemValuesAssembler->assemble($item);
        $version = $request->query('version', $collection->versioning ? 'draft' : 'published');
        if (! in_array($version, ['published', 'draft'], true)) {
            $version = 'published';
        }
        if (! $collection->versioning) {
            $version = 'published';
        }

        $draftData = is_array($item->draft_data) ? $item->draft_data : null;
        $rawData = ($version === 'draft' && $draftData !== null)
            ? $draftData
            : $rawPublished;

        $activityLogs = Activity::query()
            ->forSubject($item)
            ->with(['causer', 'subject'])
            ->latest('id')
            ->paginate($request->integer('per_page', 10))
            ->withQueryString();

        $itemPayload = (new CollectionItemResource($item))->toArray($request);
        $itemPayload['has_draft'] = $draftData !== null;
        $itemPayload['draft_data'] = $draftData;
        $itemPayload['publish_at'] = $item->publish_at?->toIso8601String();
        $itemPayload['unpublish_at'] = $item->unpublish_at?->toIso8601String();
        $itemPayload['published_at'] = $this->resolvePublishedAtIso($item);
        $itemPayload['schedule_error'] = $item->schedule_error;
        $itemPayload['schedule_failed_at'] = $item->schedule_failed_at?->toIso8601String();
        $itemPayload['approval_status'] = $item->approval_status ?? 'draft';
        $itemPayload['rejection_note'] = $item->rejection_note;
        $itemPayload['submitted_by'] = $item->submitted_by;
        $itemPayload['reviewed_by'] = $item->reviewed_by;
        $itemPayload['reviewed_at'] = $item->reviewed_at?->toIso8601String();

        return [
            'collection' => $collection,
            'item' => $itemPayload,
            'rawData' => $rawData,
            'publishedData' => $rawPublished,
            'contentVersion' => $version,
            'isNew' => false,
            'relatedCollections' => $this->collectionItemOptionsService->collectionsForSelect(),
            'fieldGrants' => $this->permissionEnforcer->fieldGrantsForForm($request, $collection),
            'previewRoles' => $this->previewRoles($request),
            'activityLogs' => ActivityLogResource::collection($activityLogs),
            'chat_count' => $item->chat?->messages()->count() ?? 0,
            'livePreviewConfigured' => $this->livePreviewUrlBuilder->templateFor($collection) !== null,
            'canUseAiDrafts' => $this->itemDraftGenerator->canDraftFor($request->user(), $collection),
        ];
    }

    /**
     * Compact role list for the “Preview as…” dialog.
     * Super-admin and admin only; omits roles the current user already holds.
     *
     * @return list<array{id: int, name: string, is_public: bool}>
     */
    private function previewRoles(Request $request): array
    {
        $user = $request->user();
        if (! PreviewCollectionItemAsRoleRequest::canPreviewAsRole($user)) {
            return [];
        }

        $ownIds = array_flip($this->permissionResolver->effectiveRoleIds($user));

        return Role::query()
            ->orderBy('name')
            ->get(['id', 'name'])
            ->reject(static fn (Role $role): bool => isset($ownIds[(int) $role->id]))
            ->map(static fn (Role $role): array => [
                'id' => (int) $role->id,
                'name' => (string) $role->name,
                'is_public' => $role->isPublic(),
            ])
            ->values()
            ->all();
    }

    /**
     * Last promote time: published_at column, else legacy publish revision.
     */
    private function resolvePublishedAtIso(CollectionItem $item): ?string
    {
        if ($item->published_at !== null) {
            return $item->published_at->toIso8601String();
        }

        $fromRevision = $item->revisions()
            ->where('meta->source', 'publish')
            ->latest('id')
            ->value('created_at');

        if ($fromRevision === null) {
            return null;
        }

        return Carbon::parse($fromRevision)->toIso8601String();
    }
}
