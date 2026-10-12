<?php

namespace App\Http\Controllers\Ai;

use App\Ai\Agents\ContentTranslator;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

/**
 * Translate a map of string field values from one content locale to another via AI.
 */
class AiTranslateFieldsController extends Controller
{
    /**
     * Run ContentTranslator and return translated field values.
     */
    public function __invoke(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'source_locale' => ['required', 'string', 'max:32'],
            'target_locale' => ['required', 'string', 'max:32', 'different:source_locale'],
            'fields' => ['required', 'array', 'min:1', 'max:50'],
            'fields.*' => ['nullable', 'string', 'max:20000'],
        ]);

        /** @var array<string, string|null> $fields */
        $fields = $validated['fields'];
        $payload = [];

        foreach ($fields as $key => $value) {
            if (! is_string($key) || $key === '') {
                continue;
            }

            $payload[$key] = is_string($value) ? $value : '';
        }

        if ($payload === []) {
            return response()->json([
                'message' => 'No translatable fields provided.',
            ], 422);
        }

        $prompt = json_encode([
            'source_locale' => $validated['source_locale'],
            'target_locale' => $validated['target_locale'],
            'fields' => $payload,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        if ($prompt === false) {
            return response()->json([
                'message' => 'Could not encode fields for translation.',
            ], 422);
        }

        try {
            $response = (new ContentTranslator)->prompt($prompt);
            $translated = $this->parseFieldsJson((string) $response->text, array_keys($payload));
        } catch (Throwable) {
            return response()->json([
                'message' => 'AI translation failed.',
            ], 502);
        }

        if ($translated === null) {
            return response()->json([
                'message' => 'AI returned an unreadable translation payload.',
            ], 502);
        }

        return response()->json([
            'fields' => $translated,
        ]);
    }

    /**
     * Parse model JSON into a field map keyed like the request.
     *
     * @param  list<string>  $expectedKeys
     * @return array<string, string>|null
     */
    private function parseFieldsJson(string $text, array $expectedKeys): ?array
    {
        $trimmed = trim($text);

        if (preg_match('/\{.*\}/s', $trimmed, $matches) === 1) {
            $trimmed = $matches[0];
        }

        $decoded = json_decode($trimmed, true);

        if (! is_array($decoded)) {
            return null;
        }

        $bag = $decoded['fields'] ?? $decoded;

        if (! is_array($bag)) {
            return null;
        }

        $out = [];

        foreach ($expectedKeys as $key) {
            $value = $bag[$key] ?? '';
            $out[$key] = is_string($value) ? $value : (is_scalar($value) ? (string) $value : '');
        }

        return $out;
    }
}
