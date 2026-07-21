<?php

namespace App\Support\Http;

/**
 * Map LM Studio Responses SSE event names onto the OpenAI shapes laravel/ai parses.
 *
 * LM Studio streams `response.reasoning_text.*`; laravel/ai only handles
 * `response.reasoning_summary_text.*`. Without this remap, reasoning tokens are
 * consumed silently, the browser SSE stays idle, and Herd nginx closes the
 * upstream after the default 60s fastcgi_read_timeout ("network error").
 */
final class LmStudioSseNormalizer
{
    /**
     * Rewrite LM Studio reasoning event type names in an SSE byte chunk.
     */
    public static function normalize(string $chunk): string
    {
        if ($chunk === '' || ! str_contains($chunk, 'reasoning_text')) {
            return $chunk;
        }

        // ponytail: substring replace is enough — event + JSON type share this prefix
        return str_replace(
            'response.reasoning_text.',
            'response.reasoning_summary_text.',
            $chunk,
        );
    }
}
