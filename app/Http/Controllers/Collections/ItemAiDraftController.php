<?php

declare(strict_types=1);

namespace App\Http\Controllers\Collections;

use App\Data\Ai\ItemDraftPromptData;
use App\Http\Controllers\Controller;
use App\Http\Requests\Collections\GenerateItemAiDraftRequest;
use App\Models\Collection;
use App\Services\Ai\ItemDraftGeneratorService;
use App\Services\Api\CollectionPermissionEnforcerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * Generate a schema-aware AI draft for the item editor (#210). Returns proposed values only;
 * the editor fills its unsaved form and the item is saved through the normal endpoints.
 */
class ItemAiDraftController extends Controller
{
    public function __construct(
        private ItemDraftGeneratorService $draftGenerator,
        private CollectionPermissionEnforcerService $permissionEnforcer,
    ) {}

    public function __invoke(GenerateItemAiDraftRequest $request, Collection $collection): JsonResponse
    {
        $input = new ItemDraftPromptData(
            user: $request->user(),
            prompt: $request->string('prompt')->toString(),
            locale: $request->string('locale')->toString(),
            fieldGrants: $this->permissionEnforcer->fieldGrantsForForm($request, $collection),
        );

        try {
            $draft = $this->draftGenerator->generate($collection, $input);
        } catch (ValidationException $exception) {
            throw $exception;
        } catch (Throwable $exception) {
            Log::warning('AI item draft failed', [
                'collection_id' => $collection->id,
                'message' => $exception->getMessage(),
            ]);

            return response()->json(['message' => __('The AI draft could not be generated. Try again later.')], 502);
        }

        return response()->json($draft->toResponseArray());
    }
}
