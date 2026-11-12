<?php

declare(strict_types=1);

namespace App\Console\Commands\Ai;

use App\Data\Ai\AiCatalogModelData;
use App\Data\Ai\AiConfiguredModelData;
use App\Services\Ai\AiModelCatalogService;
use Illuminate\Console\Command;

/**
 * Print the curated AI model catalog and the models this install is configured to use (#370).
 */
class ListAiModelsCommand extends Command
{
    protected $signature = 'ai:models';

    protected $description = 'List the AI model catalog and the configured models with their status';

    /**
     * Always succeeds: a deprecated or unverified model is a warning, not a failure.
     */
    public function handle(AiModelCatalogService $catalog): int
    {
        $this->components->info('Model catalog (config/ai-models.php)');
        $this->table(
            ['Provider', 'Model', 'Capabilities', 'Status'],
            array_map(
                static fn (AiCatalogModelData $catalogModel): array => [
                    $catalogModel->provider,
                    $catalogModel->model,
                    implode(', ', $catalogModel->capabilities),
                    $catalogModel->status->value,
                ],
                $catalog->catalog(),
            ),
        );

        $configuredModels = $catalog->configuredModels();

        $this->components->info('Configured models');
        $this->table(
            ['Usage', 'Provider', 'Model', 'Status'],
            array_map(
                static fn (AiConfiguredModelData $configuredModel): array => [
                    $configuredModel->usage,
                    $configuredModel->provider,
                    $configuredModel->model ?? '-',
                    $configuredModel->status->value,
                ],
                $configuredModels,
            ),
        );

        foreach ($configuredModels as $configuredModel) {
            if ($configuredModel->isDeprecated()) {
                $this->components->warn(sprintf(
                    'The %s model %s (%s) is deprecated: switch to a recommended model.',
                    $configuredModel->usage,
                    (string) $configuredModel->model,
                    $configuredModel->provider,
                ));
            }
        }

        return self::SUCCESS;
    }
}
