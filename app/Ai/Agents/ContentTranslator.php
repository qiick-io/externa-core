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
     * Blocking translate (no SSE). Local thinking models often need >60s.
     * Keep under nginx/Herd fastcgi_read_timeout (see site nginx / docker 600s).
     */
    public function timeout(): int
    {
        return 300;
    }

    /**
     * Get the instructions that the agent should follow.
     */
    public function instructions(): Stringable|string
    {
        return <<<'INSTRUCTIONS'
You translate CMS content field values between locales.

Rules:
- Reply with JSON only. No markdown fences, no commentary, no chain-of-thought in the reply.
- Output shape: {"fields":{...}} using the exact same keys listed in input "field_keys" / "fields".
- Never invent placeholder keys. Copy each input key character-for-character.
- Example: input fields {"title":"Ciao","body":"Mondo"} → {"fields":{"title":"Hello","body":"World"}}.
- Preserve HTML tags, markdown syntax, placeholders, and URLs.
- Empty string stays empty string.
- Match the tone of the source text.
INSTRUCTIONS;
    }
}
