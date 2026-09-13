<?php

namespace App\Ai\Support;

use Laravel\Ai\Tools\Request;

/**
 * Decodes and normalizes JSON payloads returned or accepted by AI tools.
 */
/**
 * Decodes tool JSON parameters that may arrive as strings or native arrays.
 */
final class AiToolJsonDecoder
{
    /**
     * Decode a tool parameter that may arrive as a JSON string or as an already-decoded array.
     * Local models often send arrays instead of JSON strings for *_json fields.
     *
     * @return array<int|string, mixed>|string Error string on failure.
     */
    public static function arrayFrom(Request $request, string $key): array|string
    {
        $decoded = self::optionalArrayFrom($request, $key);

        if ($decoded === null) {
            return 'Error: '.$key.' is required.';
        }

        return $decoded;
    }

    /**
     * @return array<int|string, mixed>|null|string Null when absent; error string on invalid payload.
     */
    public static function optionalArrayFrom(Request $request, string $key): array|string|null
    {
        if (! $request->has($key) && ! array_key_exists($key, $request->all())) {
            return null;
        }

        $value = $request->all()[$key] ?? null;

        if ($value === null || $value === '') {
            return null;
        }

        if (is_array($value)) {
            return $value;
        }

        if (! is_string($value)) {
            return 'Error: '.$key.' must be a JSON array.';
        }

        $trimmed = trim($value);

        if ($trimmed === '') {
            return null;
        }

        $decoded = json_decode($trimmed, true);

        if (! is_array($decoded)) {
            return 'Error: '.$key.' must be a JSON array.';
        }

        return $decoded;
    }
}
