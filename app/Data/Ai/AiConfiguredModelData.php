<?php

declare(strict_types=1);

namespace App\Data\Ai;

use App\Enums\AiModelStatusEnum;

/**
 * A model the app is configured to use, what it is used for, and its catalog status.
 */
readonly class AiConfiguredModelData
{
    /**
     * @param  'assistant'|'default'|'translate'|'item_drafts'|'embeddings'  $usage
     */
    public function __construct(
        public string $usage,
        public string $provider,
        public ?string $model,
        public AiModelStatusEnum $status,
    ) {}

    public function isDeprecated(): bool
    {
        return $this->status === AiModelStatusEnum::Deprecated;
    }

    /**
     * @return array{usage: string, provider: string, model: ?string, status: string}
     */
    public function toArray(): array
    {
        return [
            'usage' => $this->usage,
            'provider' => $this->provider,
            'model' => $this->model,
            'status' => $this->status->value,
        ];
    }
}
