<?php

namespace App\Http\Controllers\Admin;

use App\Enums\FileTypeEnum;
use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\FileResource;
use App\Models\File;
use App\Services\FileService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class FileController extends Controller
{
    public function __construct(
        protected FileService $fileService,
    ) {}

    public function index(Request $request): InertiaResponse
    {
        $parentId = $request->integer('parent_id') ?: null;
        $trashedFilter = $request->string('trashed')->toString();

        $filesQuery = File::query();

        if ($trashedFilter === 'only') {
            $filesQuery->onlyTrashed();
        } elseif ($trashedFilter === 'with') {
            $filesQuery->withTrashed();
        }

        $files = $filesQuery
            ->when(
                $parentId,
                fn ($query) => $query->where('parent_id', $parentId),
                fn ($query) => $query->whereNull('parent_id'),
            )
            ->with('currentVersion')
            ->orderByRaw('CASE WHEN type = ? THEN 0 ELSE 1 END', [FileTypeEnum::Folder->value])
            ->orderBy('name')
            ->get();

        $breadcrumbs = [];
        if ($parentId !== null) {
            $current = File::query()->withTrashed()->find($parentId);
            while ($current !== null) {
                array_unshift($breadcrumbs, [
                    'id' => $current->id,
                    'name' => $current->name,
                ]);
                $current = $current->parent;
            }
        }

        return Inertia::render('admin/files/index', [
            'files' => FileResource::collection($files)->resolve(),
            'parentId' => $parentId,
            'breadcrumbs' => $breadcrumbs,
            'filters' => [
                'trashed' => in_array($trashedFilter, ['only', 'with'], true) ? $trashedFilter : null,
            ],
        ]);
    }

    public function list(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'parent_id' => ['nullable', 'integer', 'exists:files,id'],
            'search' => ['nullable', 'string', 'max:255'],
            'trashed' => ['nullable', 'string', Rule::in(['only', 'with'])],
        ]);

        $files = File::query()
            ->when(
                ($validated['trashed'] ?? null) === 'only',
                fn ($query) => $query->onlyTrashed(),
            )
            ->when(
                ($validated['trashed'] ?? null) === 'with',
                fn ($query) => $query->withTrashed(),
            )
            ->when(
                $validated['parent_id'] ?? null,
                fn ($query, int $parentId) => $query->where('parent_id', $parentId),
                fn ($query) => $query->whereNull('parent_id'),
            )
            ->when($validated['search'] ?? null, function ($query, string $search) {
                $searchTerm = '%'.strtolower($search).'%';
                $query->where(function ($inner) use ($searchTerm) {
                    $inner->whereRaw('LOWER(name) LIKE ?', [$searchTerm])
                        ->orWhereRaw('LOWER(path) LIKE ?', [$searchTerm]);
                });
            })
            ->with('currentVersion')
            ->orderByRaw('CASE WHEN type = ? THEN 0 ELSE 1 END', [FileTypeEnum::Folder->value])
            ->orderBy('name')
            ->paginate(50);

        return response()->json($files);
    }

    public function createFolder(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'parent_id' => ['nullable', 'integer', 'exists:files,id'],
            'disk' => ['nullable', 'string', Rule::in(['assets'])],
        ]);

        $folder = $this->fileService->createFolder(
            $validated['name'],
            $validated['parent_id'] ?? null,
            $validated['disk'] ?? 'assets',
        );

        return (new FileResource($folder))
            ->response()
            ->setStatusCode(201);
    }

    public function upload(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'file' => ['required', 'file'],
            'parent_id' => ['nullable', 'integer', 'exists:files,id'],
            'disk' => ['nullable', 'string', Rule::in(['assets'])],
            'name' => ['nullable', 'string', 'max:255'],
        ]);

        $file = $this->fileService->uploadFile(
            $validated['file'],
            $validated['parent_id'] ?? null,
            $validated['disk'] ?? 'assets',
            $validated['name'] ?? null,
        );

        return (new FileResource($file))
            ->response()
            ->setStatusCode(201);
    }

    public function move(Request $request, File $file): JsonResponse
    {
        $validated = $request->validate([
            'parent_id' => ['nullable', 'integer', 'exists:files,id'],
            'disk' => ['nullable', 'string', Rule::in(['assets'])],
            'version' => ['nullable', 'date'],
        ]);

        $moved = $this->fileService->move(
            $file,
            $validated['parent_id'] ?? null,
            $validated['disk'] ?? null,
            isset($validated['version']) ? Carbon::parse($validated['version']) : null,
        );

        return (new FileResource($moved))->response();
    }

    public function rename(Request $request, File $file): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
        ]);

        $renamed = $this->fileService->rename($file, $validated['name']);

        return (new FileResource($renamed))->response();
    }

    public function destroy(File $file): Response
    {
        $this->fileService->softDelete($file);

        return response()->noContent();
    }

    public function restore(int $file): JsonResponse
    {
        $fileModel = File::query()->onlyTrashed()->findOrFail($file);

        $restored = $this->fileService->restore($fileModel);

        return (new FileResource($restored))->response();
    }

    public function forceDelete(int $file): Response
    {
        $fileModel = File::query()->withTrashed()->findOrFail($file);

        $this->fileService->forceDelete($fileModel);

        return response()->noContent();
    }

    public function attach(Request $request, File $file): Response
    {
        $validated = $request->validate([
            'model_type' => ['required', 'string'],
            'model_id' => ['required', 'integer'],
            'role' => ['nullable', 'string', 'max:255'],
            'order' => ['nullable', 'integer', 'min:0'],
        ]);

        $this->fileService->attachToModel(
            $file,
            $validated['model_type'],
            $validated['model_id'],
            $validated['role'] ?? null,
            $validated['order'] ?? 0,
        );

        return response()->noContent();
    }

    public function detach(Request $request, File $file): Response
    {
        $validated = $request->validate([
            'model_type' => ['required', 'string'],
            'model_id' => ['required', 'integer'],
            'role' => ['nullable', 'string', 'max:255'],
        ]);

        $this->fileService->detachFromModel(
            $file,
            $validated['model_type'],
            $validated['model_id'],
            $validated['role'] ?? null,
        );

        return response()->noContent();
    }

    public function initChunkUpload(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'file_name' => ['required', 'string', 'max:255'],
            'total_size' => ['required', 'integer', 'min:1'],
            'total_chunks' => ['required', 'integer', 'min:1'],
            'mime_type' => ['nullable', 'string', 'max:255'],
            'parent_id' => ['nullable', 'integer', 'exists:files,id'],
            'disk' => ['nullable', 'string', Rule::in(['assets'])],
        ]);

        $fileUpload = $this->fileService->initChunkUpload(
            $validated['file_name'],
            $validated['total_size'],
            $validated['total_chunks'],
            $validated['mime_type'] ?? null,
            $validated['parent_id'] ?? null,
            $validated['disk'] ?? 'assets',
        );

        return response()->json([
            'upload_id' => $fileUpload->upload_id,
            'expires_at' => $fileUpload->expires_at->toIso8601String(),
        ], 201);
    }

    public function uploadChunk(Request $request): Response
    {
        $validated = $request->validate([
            'upload_id' => ['required', 'string', 'max:64'],
            'chunk_index' => ['required', 'integer', 'min:0'],
            'chunk' => ['required', 'file'],
        ]);

        $this->fileService->uploadChunk(
            $validated['upload_id'],
            $validated['chunk_index'],
            $validated['chunk'],
        );

        return response()->noContent();
    }

    public function completeChunkUpload(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'upload_id' => ['required', 'string', 'max:64'],
        ]);

        $file = $this->fileService->completeChunkUpload($validated['upload_id']);

        return (new FileResource($file))
            ->response()
            ->setStatusCode(201);
    }

    public function uploadStatus(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'upload_id' => ['required', 'string', 'max:64'],
        ]);

        $status = $this->fileService->getUploadStatus($validated['upload_id']);

        if (! $status) {
            return response()->json(['message' => 'Upload not found or expired'], 404);
        }

        return response()->json($status);
    }
}
