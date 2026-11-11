<?php

declare(strict_types=1);

namespace App\Http\Controllers\Ai;

use App\Http\Controllers\Controller;
use App\Http\Requests\Ai\SearchAiPickerRequest;
use App\Http\Requests\Ai\StoreAiPromptRequest;
use App\Http\Requests\Ai\UpdateAiPromptRequest;
use App\Models\AiPrompt;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Symfony\Component\HttpFoundation\Response;

/**
 * Project-level saved AI prompts: list for chat selection; CRUD for managers.
 */
class AiPromptController extends Controller
{
    /**
     * List saved prompts for the attach picker (any CanUseAi user).
     */
    public function index(SearchAiPickerRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $search = isset($validated['search']) ? trim((string) $validated['search']) : '';

        $prompts = AiPrompt::query()
            ->when($search !== '', function ($query) use ($search): void {
                $like = '%'.$search.'%';
                $query->where(function ($builder) use ($like): void {
                    $builder->where('name', 'like', $like)
                        ->orWhere('description', 'like', $like);
                });
            })
            ->orderBy('name')
            ->limit(100)
            ->get(['id', 'name', 'description', 'body', 'updated_at']);

        return response()->json([
            'prompts' => $prompts->map(fn (AiPrompt $prompt): array => $this->promptPayload($prompt))->all(),
            'can_manage' => $this->userCanManage($request->user()),
        ]);
    }

    /**
     * Create a saved prompt (requires ai.prompts.manage).
     */
    public function store(StoreAiPromptRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $data = $request->validated();

        $prompt = AiPrompt::query()->create([
            'name' => $data['name'],
            'description' => $data['description'] ?? null,
            'body' => $data['body'],
            'created_by' => $user->id,
            'updated_by' => $user->id,
        ]);

        return response()->json([
            'prompt' => $this->promptPayload($prompt),
        ], Response::HTTP_CREATED);
    }

    /**
     * Update a saved prompt (requires ai.prompts.manage).
     */
    public function update(UpdateAiPromptRequest $request, AiPrompt $prompt): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $data = $request->validated();

        $prompt->fill([
            ...$data,
            'updated_by' => $user->id,
        ])->save();

        return response()->json([
            'prompt' => $this->promptPayload($prompt->fresh()),
        ]);
    }

    /**
     * Delete a saved prompt (requires ai.prompts.manage).
     */
    public function destroy(Request $request, AiPrompt $prompt): JsonResponse
    {
        abort_unless(Gate::allows('delete', $prompt), Response::HTTP_FORBIDDEN);

        $prompt->delete();

        return response()->json(['ok' => true]);
    }

    /**
     * @return array{id: int, name: string, description: string|null, body: string, updated_at: string|null}
     */
    private function promptPayload(AiPrompt $prompt): array
    {
        return [
            'id' => $prompt->id,
            'name' => $prompt->name,
            'description' => $prompt->description,
            'body' => $prompt->body,
            'updated_at' => $prompt->updated_at?->toIso8601String(),
        ];
    }

    private function userCanManage(?User $user): bool
    {
        if ($user === null) {
            return false;
        }

        return Gate::forUser($user)->allows('create', AiPrompt::class);
    }
}
