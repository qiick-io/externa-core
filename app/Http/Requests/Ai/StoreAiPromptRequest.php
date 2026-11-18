<?php

declare(strict_types=1);

namespace App\Http\Requests\Ai;

use App\Models\AiPrompt;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Symfony\Component\HttpFoundation\Response;

/**
 * Validate creating a project-level saved AI prompt.
 */
class StoreAiPromptRequest extends FormRequest
{
    public function authorize(): bool
    {
        abort_unless(Gate::allows('create', AiPrompt::class), Response::HTTP_FORBIDDEN);

        return true;
    }

    /**
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:255'],
            'body' => ['required', 'string', 'max:20000'],
        ];
    }
}
