<?php

declare(strict_types=1);

namespace App\Ai\Agents;

use App\Services\Ai\ItemDraftGeneratorService;
use Closure;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\JsonSchema\Types\Type;
use Laravel\Ai\Contracts\Agent;
use Laravel\Ai\Contracts\HasStructuredOutput;
use Laravel\Ai\Promptable;
use Stringable;

/**
 * One-shot structured-output agent that drafts collection item field values (#210).
 *
 * The schema is built per collection by {@see ItemDraftGeneratorService}, so
 * the model can only answer with the collection's text-like fields; the service still validates
 * every value against the field rules because providers do not all enforce the schema.
 */
class ItemDraftWriter implements Agent, HasStructuredOutput
{
    use Promptable;

    /**
     * @param  Closure(JsonSchema): array<string, Type>  $schemaBuilder
     */
    public function __construct(
        private readonly Closure $schemaBuilder,
        private readonly ?int $maxTokenLimit = null,
    ) {}

    /**
     * Local models can need well over a minute for a full draft; stay under the web server timeout.
     */
    public function timeout(): int
    {
        return 300;
    }

    /**
     * Read by laravel/ai when building the text generation options (null = provider default).
     */
    public function maxTokens(): ?int
    {
        return $this->maxTokenLimit !== null && $this->maxTokenLimit > 0 ? $this->maxTokenLimit : null;
    }

    public function instructions(): Stringable|string
    {
        return <<<'INSTRUCTIONS'
You draft content for a headless CMS item from a short editor brief.

Rules:
- Fill the fields of the output schema only; leave out a field when the brief gives nothing for it.
- Write every value in the requested locale.
- For fields with allowed values, use one of the listed values exactly.
- Respect the length limits and the format named in each field description (plain text, HTML, Markdown).
- Never invent facts that are not implied by the brief; keep the tone neutral unless the brief asks otherwise.
INSTRUCTIONS;
    }

    /**
     * @return array<string, Type>
     */
    public function schema(JsonSchema $schema): array
    {
        return ($this->schemaBuilder)($schema);
    }
}
