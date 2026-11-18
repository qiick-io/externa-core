<?php

declare(strict_types=1);

namespace App\Http\Controllers\Collections;

use App\Http\Controllers\Controller;
use App\Http\Requests\Collections\ApplyFieldPackRequest;
use App\Models\Collection;
use App\Services\Collections\ApplyFieldPackService;
use Illuminate\Http\RedirectResponse;

/**
 * Apply a registered field pack to an existing collection.
 */
class FieldPackController extends Controller
{
    /**
     * Apply a registered field pack (create missing fields, skip existing names).
     */
    public function applyPack(
        ApplyFieldPackRequest $request,
        Collection $collection,
        string $pack,
        ApplyFieldPackService $applyFieldPack,
    ): RedirectResponse {
        $result = $applyFieldPack->apply($collection, $pack);

        $createdCount = count($result['created']);
        $skippedCount = count($result['skipped']);

        $message = $createdCount === 0 && $skippedCount > 0
            ? __(':skipped field(s) already existed — nothing created.', ['skipped' => $skippedCount])
            : __(':created field(s) created, :skipped skipped.', [
                'created' => $createdCount,
                'skipped' => $skippedCount,
            ]);

        return redirect()->route('collections.fields.index', $collection)
            ->with('success', $message);
    }
}
