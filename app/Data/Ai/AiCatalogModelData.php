<?php

declare(strict_types=1);

namespace App\Data\Ai;

use App\Enums\AiModelStatusEnum;

/**
 * One entry of the curated AI model catalog (config/ai-models.php).
 */
readonly class AiCatalogModelData
{
    /**
     * @param  list<string>  $capabilities  tools, vision and/or embeddings
     */
    public function __construct(
        public string $provider,
        public string $model,
        public array $capabilities,
        public AiModelStatusEnum $status,
    ) {}

    /**
     * @return array{provider: string, model: string, capabilities: list<string>, status: string}
     */
    public function toArray(): array
    {
        return [
            'provider' => $this->provider,
            'model' => $this->model,
            'capabilities' => $this->capabilities,
            'status' => $this->status->value,
        ];
    }
}
