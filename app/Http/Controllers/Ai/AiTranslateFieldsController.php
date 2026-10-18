<?php

namespace App\Http\Controllers\Ai;

use App\Ai\Agents\ContentTranslator;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
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
            'field_keys' => array_keys($payload),
            'fields' => $payload,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        if ($prompt === false) {
            return response()->json([
                'message' => 'Could not encode fields for translation.',
            ], 422);
        }

        try {
            // Herd/nginx often caps idle FastCGI at ~60s; thinking models exceed that on sync POST.
            // Skip in Pest: set_time_limit caps the whole PHPUnit process and kills the suite.
            if (! app()->runningUnitTests()) {
                set_time_limit(320);
            }

            $translateModel = config('ai.providers.local.models.text.translate');
            $model = is_string($translateModel) && $translateModel !== ''
                ? $translateModel
                : null;

            $response = (new ContentTranslator)->prompt(
                $prompt,
                model: $model,
            );
            $translated = $this->parseFieldsJson((string) $response->text, array_keys($payload));
        } catch (Throwable $exception) {
            Log::warning('AI field translation failed', [
                'message' => $exception->getMessage(),
                'provider' => config('ai.default'),
                'url' => config('ai.providers.local.url'),
                'model' => config('ai.providers.local.models.text.default'),
            ]);

            return response()->json([
                'message' => $this->publicFailureMessage($exception),
            ], 502);
        }

        if ($translated === null) {
            return response()->json([
                'message' => 'AI returned an unreadable translation payload.',
            ], 502);
        }

        if ($this->droppedNonEmptySources($payload, $translated)) {
            return response()->json([
                'message' => 'AI returned empty translations for non-empty fields.',
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
        $missing = [];

        foreach ($expectedKeys as $key) {
            if (! array_key_exists($key, $bag)) {
                $missing[] = $key;
                $out[$key] = '';

                continue;
            }

            $value = $bag[$key];
            $out[$key] = is_string($value) ? $value : (is_scalar($value) ? (string) $value : '');
        }

        if ($missing !== []) {
            $leftovers = [];

            foreach ($bag as $bagKey => $bagValue) {
                if (in_array($bagKey, $expectedKeys, true)) {
                    continue;
                }

                if (! is_string($bagValue) && ! is_scalar($bagValue)) {
                    continue;
                }

                $leftovers[] = is_string($bagValue) ? $bagValue : (string) $bagValue;
            }

            // ponytail: small models sometimes echo instruction placeholders (e.g. field_key)
            // instead of real keys; zip leftovers onto missing keys when counts match.
            if (count($leftovers) === count($missing)) {
                foreach ($missing as $index => $key) {
                    $out[$key] = $leftovers[$index];
                }
            }
        }

        return $out;
    }

    /**
     * True when any non-empty source mapped to an empty translation.
     *
     * @param  array<string, string>  $payload
     * @param  array<string, string>  $translated
     */
    private function droppedNonEmptySources(array $payload, array $translated): bool
    {
        foreach ($payload as $key => $source) {
            if (trim($source) === '') {
                continue;
            }

            if (trim($translated[$key] ?? '') === '') {
                return true;
            }
        }

        return false;
    }

    /**
     * Short user-facing reason without leaking stack traces.
     */
    private function publicFailureMessage(Throwable $exception): string
    {
        $raw = trim($exception->getMessage());

        if ($raw === '') {
            return 'AI translation failed.';
        }

        $compact = preg_replace('/\s+/', ' ', $raw) ?? $raw;
        $compact = mb_substr($compact, 0, 180);

        if (str_contains(strtolower($compact), 'connection')
            || str_contains(strtolower($compact), 'timed out')
            || str_contains(strtolower($compact), 'curl')) {
            return 'AI translation failed: cannot reach local AI at '
                .rtrim((string) config('ai.providers.local.url'), '/')
                .'. Check LM Studio and LOCAL_AI_URL.';
        }

        return 'AI translation failed: '.$compact;
    }
}
