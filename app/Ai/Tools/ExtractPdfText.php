<?php

namespace App\Ai\Tools;

use App\Ai\Concerns\ChecksAiPermissions;
use App\Ai\Concerns\LogsAiToolUse;
use App\Enums\PermissionEnum;
use App\Models\AiChatAttachment;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Smalot\PdfParser\Parser;
use Stringable;

/**
 * AI tool that extracts text content from a PDF file for the assistant.
 */
class ExtractPdfText implements Tool
{
    use ChecksAiPermissions;
    use LogsAiToolUse;

    private const MAX_CHARACTERS = 20_000;

    /**
     * Describe what this tool does for the model.
     */
    public function description(): Stringable|string
    {
        return 'Extract readable text from an uploaded PDF attachment, truncated to a safe response size.';
    }

    /**
     * Execute the tool request and return a string result for the model.
     */
    public function handle(Request $request): Stringable|string
    {
        return $this->withAiToolLogging($request, function () use ($request): string {
            if ($error = $this->requirePermission(PermissionEnum::CanCreateCollections)) {
                return $error;
            }

            $user = $this->authenticatedUser();
            $attachment = AiChatAttachment::query()
                ->whereKey(trim((string) $request->string('attachment_id')))
                ->where('user_id', $user?->id)
                ->first();

            if ($attachment === null || strtolower(pathinfo($attachment->original_name, PATHINFO_EXTENSION)) !== 'pdf') {
                return 'Error: Allegato PDF non trovato o non di tua proprietà.';
            }

            if ($attachment->isExpired()) {
                $attachment->delete();

                return 'Error: Allegato scaduto. Caricalo di nuovo.';
            }

            $text = trim((new Parser)->parseFile($attachment->absolutePath())->getText());

            return json_encode([
                'ok' => true,
                'attachment_id' => $attachment->id,
                'characters' => mb_strlen($text),
                'truncated' => mb_strlen($text) > self::MAX_CHARACTERS,
                'text' => mb_substr($text, 0, self::MAX_CHARACTERS),
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) ?: '{}';
        });
    }

    /**
     * @return array<string, mixed>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'attachment_id' => $schema->string()->required()->description('UUID of the uploaded PDF attachment'),
        ];
    }
}
