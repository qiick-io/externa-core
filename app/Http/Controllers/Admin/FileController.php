<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Enums\FileTypeEnum;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\Files\ListFilesRequest;
use App\Http\Requests\Admin\Files\StoreFolderRequest;
use App\Http\Requests\Admin\UpdateFileMetadataRequest;
use App\Http\Resources\Admin\FileResource;
use App\Models\File;
use App\Services\Files\FileFavoriteFlagService;
use App\Services\Files\FileWhereUsedScannerService;
use App\Services\FileService;
use App\Support\Files\FilesDisk;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

/**
 * File manager browsing (index, list, where-used), folder creation and metadata edits.
 *
 * Uploads, downloads, trash, tags, favorites, attachments and move / copy / rename live in
 * the sibling `File*Controller` classes under the same `files.*` route names.
 */
class FileController extends Controller
{
    /**
     * Files per grid page: divisible by 2, 3, 4, 6 and 8, so every responsive
     * column count ends on a full row.
     */
    private const PAGE_SIZE = 48;

    public function __construct(
        protected FileService $fileService,
        protected FileWhereUsedScannerService $fileWhereUsedScanner,
        protected FileFavoriteFlagService $fileFavoriteFlag,
    ) {}

    /**
     * On-demand scan of collection items that reference this file.
     */
    public function whereUsed(File $file): JsonResponse
    {
        $references = $this->fileWhereUsedScanner->findReferences((int) $file->id);

        return response()->json([
            'file_id' => (int) $file->id,
            'count' => count($references),
            'references' => $references,
        ]);
    }

    /**
     * Render the file manager index for a folder, bootstrapping page 1 for infinite scroll.
     *
     * Grid load-more always starts at page 1; subsequent pages use {@see list()}.
     */
    public function index(Request $request, ?int $folder = null): InertiaResponse|RedirectResponse
    {
        $parentId = null;

        if ($folder !== null) {
            $folderModel = File::query()->find($folder);

            if ($folderModel === null || ! $folderModel->isFolder()) {
                return redirect()->route(
                    'files.index',
                    collect($request->query())->except('parent_id')->all(),
                );
            }

            $parentId = $folderModel->id;
        }

        $validated = $request->validate([
            'trashed' => ['nullable', 'string', Rule::in(['only', 'with'])],
            'sort' => ['nullable', 'string', Rule::in(ListFilesRequest::SORTABLE_COLUMNS)],
            'direction' => ['nullable', 'string', Rule::in(['asc', 'desc'])],
            'tag_ids' => ['nullable', 'array'],
            'tag_ids.*' => ['integer', 'min:1'],
            'tags' => ['nullable', 'array'],
            'tags.*' => ['string', 'max:100'],
        ]);

        $trashedFilter = $validated['trashed'] ?? null;
        $sort = $validated['sort'] ?? 'name';
        $direction = $validated['direction'] ?? 'asc';
        [$tagIds, $tagNames] = $this->resolveTagFilters($request);

        $paginator = $this->folderQuery(
            $request,
            $parentId,
            $trashedFilter,
            null,
            $tagIds,
            $tagNames,
            $sort,
            $direction,
        )
            ->paginate(self::PAGE_SIZE, ['*'], 'page', 1)
            ->withQueryString();

        $breadcrumbs = [];
        if ($parentId !== null) {
            $current = File::query()->find($parentId);
            while ($current !== null) {
                array_unshift($breadcrumbs, [
                    'id' => $current->id,
                    'name' => $current->name,
                ]);
                $current = $current->parent;
            }
        }

        return Inertia::render('admin/files/index', [
            'files' => [
                'data' => FileResource::collection($paginator->items())->resolve(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
            'parentId' => $parentId,
            'breadcrumbs' => $breadcrumbs,
            'filters' => [
                'trashed' => in_array($trashedFilter, ['only', 'with'], true) ? $trashedFilter : null,
                'tag_ids' => $tagIds,
                'sort' => $sort,
                'direction' => $direction,
            ],
        ]);
    }

    /**
     * Return a paginated JSON listing of files for load-more requests.
     */
    public function list(ListFilesRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $ids = collect($validated['ids'] ?? [])
            ->map(static fn (mixed $id): int => (int) $id)
            ->filter(static fn (int $id): bool => $id > 0)
            ->unique()
            ->values()
            ->all();

        if ($ids !== []) {
            $userId = $request->user()?->id;
            $files = File::query()
                ->with(['tags', 'currentVersion'])
                ->whereIn('id', $ids)
                ->when(
                    $userId !== null,
                    fn (Builder $builder) => $builder->withExists([
                        'favoritedBy as is_favorited' => fn (Builder $favorite) => $favorite->where('user_id', $userId),
                    ]),
                )
                ->get()
                ->sortBy(static fn (File $file): int|false => array_search($file->id, $ids, true))
                ->values();

            return response()->json([
                'data' => FileResource::collection($files)->resolve(),
                'current_page' => 1,
                'last_page' => 1,
                'per_page' => $files->count(),
                'total' => $files->count(),
            ]);
        }

        [$tagIds, $tagNames] = $this->resolveTagFilters($request);

        $paginator = $this->folderQuery(
            $request,
            $request->validatedParentId(),
            $validated['trashed'] ?? null,
            $validated['search'] ?? null,
            $tagIds,
            $tagNames,
            $validated['sort'] ?? 'name',
            $validated['direction'] ?? 'asc',
        )->paginate(self::PAGE_SIZE);

        return response()->json([
            'data' => FileResource::collection($paginator->items())->resolve(),
            'current_page' => $paginator->currentPage(),
            'last_page' => $paginator->lastPage(),
            'per_page' => $paginator->perPage(),
            'total' => $paginator->total(),
        ]);
    }

    /**
     * Create a folder in the file manager.
     */
    public function createFolder(StoreFolderRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $folder = $this->fileService->createFolder(
            $validated['name'],
            $request->validatedParentId(),
            $validated['disk'] ?? FilesDisk::default(),
        );

        return (new FileResource($folder->load('tags')))
            ->response()
            ->setStatusCode(201);
    }

    /**
     * Update editable metadata for a file.
     */
    public function update(UpdateFileMetadataRequest $request, File $file): JsonResponse
    {
        $updated = $this->fileService->updateMetadata($file, $request->validated());

        return (new FileResource($this->fileFavoriteFlag->withFavoriteFlag($updated, $request->user()?->id)))->response();
    }

    /**
     * Build the folder listing query with trash, search, tag, and sort behavior.
     *
     * Flat trash shows every soft-deleted item regardless of folder; active views stay scoped
     * to the current parent. Tag filters match any selected tag (OR). Results order folders
     * before files, then the requested sort, then id.
     *
     * @param  list<int>  $tagIds
     * @param  list<string>  $tagNames
     * @return Builder<File>
     */
    protected function folderQuery(
        Request $request,
        ?int $parentId,
        ?string $trashedFilter = null,
        ?string $search = null,
        array $tagIds = [],
        array $tagNames = [],
        string $sort = 'name',
        string $direction = 'asc',
    ): Builder {
        $userId = $request->user()?->id;
        $sortColumn = in_array($sort, ListFilesRequest::SORTABLE_COLUMNS, true) ? $sort : 'name';
        $sortDirection = $direction === 'desc' ? 'desc' : 'asc';

        $query = File::query()
            ->with('tags')
            ->when(
                $trashedFilter === 'only',
                fn (Builder $builder) => $builder->onlyTrashed(),
            )
            ->when(
                $trashedFilter === 'with',
                fn (Builder $builder) => $builder->withTrashed(),
            )
            ->when(
                $trashedFilter !== 'only',
                fn (Builder $builder) => $builder->when(
                    $parentId,
                    fn (Builder $scoped) => $scoped->where('parent_id', $parentId),
                    fn (Builder $scoped) => $scoped->whereNull('parent_id'),
                ),
            )
            ->when($search, function (Builder $builder) use ($search) {
                $searchTerm = '%'.strtolower($search).'%';
                $builder->where(function (Builder $inner) use ($searchTerm) {
                    // raw-sql: reviewed — search term bound; folder-first ORDER BY uses bound enum
                    $inner->whereRaw('LOWER(name) LIKE ?', [$searchTerm])
                        // raw-sql: reviewed — search term bound; folder-first ORDER BY uses bound enum
                        ->orWhereRaw('LOWER(path) LIKE ?', [$searchTerm])
                        // raw-sql: reviewed — search term bound; folder-first ORDER BY uses bound enum
                        ->orWhereRaw('LOWER(title) LIKE ?', [$searchTerm]);
                });
            })
            ->when($tagIds !== [], function (Builder $builder) use ($tagIds) {
                $builder->whereHas(
                    'tags',
                    fn (Builder $tagQuery) => $tagQuery->whereIn(File::getTagTablePrimaryKeyName(), $tagIds),
                );
            })
            ->when($tagIds === [] && $tagNames !== [], function (Builder $builder) use ($tagNames) {
                $builder->withAnyTags($tagNames);
            })
            ->with('currentVersion');

        if ($userId !== null) {
            $query->withExists([
                'favoritedBy as is_favorited' => fn (Builder $builder) => $builder->where('user_id', $userId),
            ])->orderByDesc('is_favorited');
        }

        return $query
            // raw-sql: reviewed — search term bound; folder-first ORDER BY uses bound enum
            ->orderByRaw('CASE WHEN type = ? THEN 0 ELSE 1 END', [FileTypeEnum::Folder->value])
            ->orderBy($sortColumn, $sortDirection)
            ->orderBy('id');
    }

    /**
     * Normalize tag id and name filters from the request payload.
     *
     * @return array{0: list<int>, 1: list<string>}
     */
    protected function resolveTagFilters(Request $request): array
    {
        $tagIds = collect($request->input('tag_ids', []))
            ->map(static fn (mixed $tagId): int => (int) $tagId)
            ->filter(static fn (int $tagId): bool => $tagId > 0)
            ->unique()
            ->values()
            ->all();

        $tagNames = collect($request->input('tags', []))
            ->map(static fn (mixed $tagName): string => trim((string) $tagName))
            ->filter(static fn (string $tagName): bool => $tagName !== '')
            ->unique()
            ->values()
            ->all();

        return [$tagIds, $tagNames];
    }
}
