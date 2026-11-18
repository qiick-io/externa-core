<?php

declare(strict_types=1);

namespace App\Services\Ai;

use App\Data\Ai\AiCatalogModelData;
use App\Data\Ai\AiConfiguredModelData;
use App\Enums\AiModelStatusEnum;
use Laravel\Ai\Ai;
use Throwable;

/**
 * Reads the curated model catalog (config/ai-models.php, #370) and rates the models the app
 * is configured to use. A model the catalog does not list is "unverified", never rejected:
 * local and custom models (LOCAL_AI_MODEL) stay allowed.
 */
class AiModelCatalogService
{
    /**
     * Every catalog entry; malformed entries (missing provider or model, unknown status) are skipped.
     *
     * @return list<AiCatalogModelData>
     */
    public function catalog(): array
    {
        $entries = config('ai-models.models', []);
        $catalogModels = [];

        foreach (is_array($entries) ? $entries : [] as $entry) {
            if (! is_array($entry) || ! is_string($entry['provider'] ?? null) || ! is_string($entry['model'] ?? null)) {
                continue;
            }

            $status = AiModelStatusEnum::tryFrom((string) ($entry['status'] ?? ''));

            if ($status === null || $status === AiModelStatusEnum::Unverified) {
                continue;
            }

            $capabilities = is_array($entry['capabilities'] ?? null) ? $entry['capabilities'] : [];

            $catalogModels[] = new AiCatalogModelData(
                provider: $entry['provider'],
                model: $entry['model'],
                capabilities: array_values(array_filter($capabilities, 'is_string')),
                status: $status,
            );
        }

        return $catalogModels;
    }

    /**
     * Catalog status of a provider + model pair; anything not listed is unverified.
     */
    public function statusFor(string $provider, ?string $model): AiModelStatusEnum
    {
        foreach ($this->catalog() as $catalogModel) {
            if ($catalogModel->provider === $provider && $catalogModel->model === $model) {
                return $catalogModel->status;
            }
        }

        return AiModelStatusEnum::Unverified;
    }

    /**
     * The models the current configuration uses: the assistant, the default text provider,
     * the translate override, the item drafts model and embeddings (when each is on).
     *
     * @return list<AiConfiguredModelData>
     */
    public function configuredModels(): array
    {
        $assistantProvider = $this->providerName(config('ai.assistant.provider'), 'local');
        $defaultProvider = $this->providerName(config('ai.default'), 'local');

        /** @var list<array{0: 'assistant'|'default'|'translate'|'item_drafts'|'embeddings', 1: string, 2: ?string}> $usages */
        $usages = [
            ['assistant', $assistantProvider, $this->defaultTextModel($assistantProvider)],
            ['default', $defaultProvider, $this->defaultTextModel($defaultProvider)],
        ];

        $translateModel = $this->nonEmptyString(config('ai.providers.local.models.text.translate'));

        if ($translateModel !== null) {
            $usages[] = ['translate', $defaultProvider, $translateModel];
        }

        $itemDraftsModel = $this->nonEmptyString(config('ai.item_drafts.model'));

        if ((bool) config('ai.item_drafts.enabled', false) && $itemDraftsModel !== null) {
            $usages[] = ['item_drafts', $defaultProvider, $itemDraftsModel];
        }

        if ((bool) config('ai.embeddings.enabled', false)) {
            $embeddingsProvider = $this->providerName(config('ai.default_for_embeddings'), 'openai');
            $usages[] = ['embeddings', $embeddingsProvider, $this->defaultEmbeddingsModel($embeddingsProvider)];
        }

        return array_map(
            fn (array $usage): AiConfiguredModelData => new AiConfiguredModelData(
                usage: $usage[0],
                provider: $usage[1],
                model: $usage[2],
                status: $this->statusFor($usage[1], $usage[2]),
            ),
            $usages,
        );
    }

    /**
     * The configured models whose catalog status is deprecated.
     *
     * @return list<AiConfiguredModelData>
     */
    public function deprecatedConfiguredModels(): array
    {
        return array_values(array_filter(
            $this->configuredModels(),
            static fn (AiConfiguredModelData $configuredModel): bool => $configuredModel->isDeprecated(),
        ));
    }

    /**
     * The provider's text model: the configured `models.text.default`, else the laravel/ai default.
     * Null when the provider cannot be built (unknown name, missing driver).
     */
    private function defaultTextModel(string $provider): ?string
    {
        try {
            return Ai::textProvider($provider)->defaultTextModel();
        } catch (Throwable) {
            return $this->nonEmptyString(config('ai.providers.'.$provider.'.models.text.default'));
        }
    }

    private function defaultEmbeddingsModel(string $provider): ?string
    {
        try {
            return Ai::embeddingProvider($provider)->defaultEmbeddingsModel();
        } catch (Throwable) {
            return $this->nonEmptyString(config('ai.providers.'.$provider.'.models.embeddings.default'));
        }
    }

    private function providerName(mixed $configured, string $fallback): string
    {
        return $this->nonEmptyString($configured) ?? $fallback;
    }

    private function nonEmptyString(mixed $value): ?string
    {
        return is_string($value) && $value !== '' ? $value : null;
    }
}
