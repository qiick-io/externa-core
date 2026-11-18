<?php

declare(strict_types=1);

namespace App\Http\Controllers\Collections;

use App\Http\Controllers\Controller;
use App\Http\Requests\Collections\CheckCollectionSlugRequest;
use App\Services\Collections\UniqueCollectionSlugGeneratorService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Str;

/**
 * Live slug availability check for the collection create / edit drawer.
 */
class CollectionSlugController extends Controller
{
    /**
     * Check whether a collection slug is available (unique), optionally excluding one id.
     */
    public function checkSlug(CheckCollectionSlugRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $slug = Str::slug((string) $validated['slug']);
        $excludeId = isset($validated['exclude']) ? (int) $validated['exclude'] : null;
        $excludeId = $excludeId !== null && $excludeId > 0 ? $excludeId : null;

        $generator = app(UniqueCollectionSlugGeneratorService::class);
        $available = $slug !== ''
            && (bool) preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $slug)
            && $generator->isAvailable($slug, $excludeId);

        return response()->json([
            'available' => $available,
            'slug' => $slug,
        ]);
    }
}
