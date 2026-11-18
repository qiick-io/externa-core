<?php

declare(strict_types=1);

namespace App\Http\Requests\Ai;

use App\Models\AiPrompt;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Symfony\Component\HttpFoundation\Response;

/**
 * Validate updating a project-level saved AI prompt.
 */
class UpdateAiPromptRequest extends FormRequest
{
    public function authorize(): bool
    {
        $prompt = $this->route('prompt');

        abort_unless($prompt instanceof AiPrompt && Gate::allows('update', $prompt), Response::HTTP_FORBIDDEN);

        return true;
    }

    /**
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'required', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:255'],
            'body' => ['sometimes', 'required', 'string', 'max:20000'],
        ];
    }
}
