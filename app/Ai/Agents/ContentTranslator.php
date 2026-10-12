<?php

namespace App\Ai\Agents;

use Laravel\Ai\Attributes\Provider;
use Laravel\Ai\Contracts\Agent;
use Laravel\Ai\Promptable;
use Stringable;

#[Provider('local')]
/**
 * One-shot field-value translator (no tools). Returns JSON text the controller parses.
 */
class ContentTranslator implements Agent
{
    use Promptable;

    /**
     * Keep translate calls shorter than the tool-heavy assistant.
     */
    public function timeout(): int
    {
        return 120;
    }

    /**
     * Get the instructions that the agent should follow.
     */
    public function instructions(): Stringable|string
    {
        return <<<'INSTRUCTIONS'
You translate CMS content field values between locales.

Rules:
- Reply with JSON only. No markdown fences, no commentary.
- Shape: {"fields":{"field_key":"translated value",...}}
- Keep the same keys as the input. Do not invent or drop keys.
- Preserve HTML tags, markdown syntax, placeholders, and URLs.
- Empty string stays empty string.
- Match the tone of the source text.
INSTRUCTIONS;
    }
}
