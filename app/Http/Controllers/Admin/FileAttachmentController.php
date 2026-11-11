<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\Files\AttachFileRequest;
use App\Http\Requests\Admin\Files\DetachFileRequest;
use App\Models\File;
use App\Services\FileService;
use Illuminate\Http\Response;

/**
 * Links between a file manager file and a polymorphic model (role and order).
 */
class FileAttachmentController extends Controller
{
    public function __construct(
        protected FileService $fileService,
    ) {}

    /**
     * Attach a file to a polymorphic model with optional role and order.
     */
    public function attach(AttachFileRequest $request, File $file): Response
    {
        $validated = $request->validated();

        $this->fileService->attachToModel(
            $file,
            $validated['model_type'],
            (int) $validated['model_id'],
            $validated['role'] ?? null,
            (int) ($validated['order'] ?? 0),
        );

        return response()->noContent();
    }

    /**
     * Detach a file from a polymorphic model.
     */
    public function detach(DetachFileRequest $request, File $file): Response
    {
        $validated = $request->validated();

        $this->fileService->detachFromModel(
            $file,
            $validated['model_type'],
            (int) $validated['model_id'],
            $validated['role'] ?? null,
        );

        return response()->noContent();
    }
}
