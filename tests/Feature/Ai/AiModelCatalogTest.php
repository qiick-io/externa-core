<?php

declare(strict_types=1);

use App\Enums\AiModelStatusEnum;
use App\Enums\PermissionEnum;
use App\Models\User;
use App\Services\Ai\AiModelCatalogService;
use Database\Seeders\PermissionSeeder;
use Illuminate\Support\Facades\Artisan;
use Inertia\Testing\AssertableInertia;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();

    config([
        'ai.assistant.provider' => 'local',
        'ai.default' => 'local',
        'ai.providers.local.models.text.default' => 'my-local-model',
        'ai.providers.local.models.text.translate' => null,
        'ai.item_drafts.enabled' => false,
        'ai.embeddings.enabled' => false,
    ]);
});

/**
 * Point the assistant at Anthropic with a model the catalog marks deprecated.
 */
function useDeprecatedAssistantModel(): void
{
    config([
        'ai-models.models' => [
            ...config('ai-models.models'),
            ['provider' => 'anthropic', 'model' => 'claude-retired-1', 'capabilities' => ['tools'], 'status' => 'deprecated'],
        ],
        'ai.assistant.provider' => 'anthropic',
        'ai.providers.anthropic.models.text.default' => 'claude-retired-1',
    ]);
}

it('ships a well-formed catalog with at least one recommended model', function (): void {
    $entries = config('ai-models.models');
    $statuses = ['recommended', 'supported', 'deprecated'];

    expect($entries)->toBeArray()->not->toBeEmpty();

    foreach ($entries as $entry) {
        expect($entry)->toHaveKeys(['provider', 'model', 'capabilities', 'status'])
            ->and(config('ai.providers.'.$entry['provider']))->toBeArray()
            ->and($entry['model'])->toBeString()->not->toBeEmpty()
            ->and($statuses)->toContain($entry['status'])
            ->and(array_diff($entry['capabilities'], ['tools', 'vision', 'embeddings']))->toBe([]);
    }

    $pairs = array_map(fn (array $entry): string => $entry['provider'].'/'.$entry['model'], $entries);

    expect($pairs)->toBe(array_unique($pairs))
        ->and(array_column($entries, 'status'))->toContain('recommended')
        ->and(app(AiModelCatalogService::class)->catalog())->toHaveCount(count($entries));
});

it('rates catalog models and keeps local or unknown models allowed as unverified', function (): void {
    $catalog = app(AiModelCatalogService::class);

    expect($catalog->statusFor('anthropic', 'claude-sonnet-5-5'))->toBe(AiModelStatusEnum::Recommended)
        ->and($catalog->statusFor('local', 'my-local-model'))->toBe(AiModelStatusEnum::Unverified)
        ->and($catalog->statusFor('anthropic', 'claude-custom'))->toBe(AiModelStatusEnum::Unverified)
        ->and($catalog->statusFor('openai', 'claude-sonnet-5-5'))->toBe(AiModelStatusEnum::Unverified);

    $assistant = $catalog->configuredModels()[0];

    expect($assistant->usage)->toBe('assistant')
        ->and($assistant->model)->toBe('my-local-model')
        ->and($assistant->status)->toBe(AiModelStatusEnum::Unverified);
});

it('lists the optional usages only when they are configured', function (): void {
    config([
        'ai.providers.local.models.text.translate' => 'fast-local',
        'ai.item_drafts.enabled' => true,
        'ai.item_drafts.model' => 'draft-local',
        'ai.embeddings.enabled' => true,
        'ai.default_for_embeddings' => 'openai',
    ]);

    $configured = collect(app(AiModelCatalogService::class)->configuredModels())
        ->mapWithKeys(fn ($configuredModel): array => [$configuredModel->usage => $configuredModel]);

    expect($configured->keys()->all())->toBe(['assistant', 'default', 'translate', 'item_drafts', 'embeddings'])
        ->and($configured['translate']->model)->toBe('fast-local')
        ->and($configured['item_drafts']->model)->toBe('draft-local')
        ->and($configured['embeddings']->model)->toBe('text-embedding-3-small')
        ->and($configured['embeddings']->status)->toBe(AiModelStatusEnum::Recommended);
});

it('prints the catalog and the configured models with ai:models', function (): void {
    expect(Artisan::call('ai:models'))->toBe(0);

    expect(Artisan::output())
        ->toMatch('/claude-sonnet-5-5\s*\|[^\n]*\|\s*recommended/')
        ->toMatch('/assistant\s*\|\s*local\s*\|\s*my-local-model\s*\|\s*unverified/')
        ->not->toContain('is deprecated');
});

it('warns about a deprecated configured model in ai:models without failing', function (): void {
    useDeprecatedAssistantModel();

    expect(Artisan::call('ai:models'))->toBe(0)
        ->and(Artisan::output())->toContain('The assistant model claude-retired-1 (anthropic) is deprecated');
});

it('passes the configured models and the catalog to the AI settings page', function (): void {
    $user = grantProjectSettingsPermissions(User::factory()->create(), [
        PermissionEnum::CanManageProjectSettings->value,
    ]);

    $this->actingAs($user)
        ->get(route('ai-tools.edit'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('settings/ai-tools')
            ->where('configuredModels.0', [
                'usage' => 'assistant',
                'provider' => 'local',
                'model' => 'my-local-model',
                'status' => 'unverified',
            ])
            ->has('catalogModels', count(config('ai-models.models'))));
});

it('saves AI settings with a non-blocking warning when a configured model is deprecated', function (): void {
    useDeprecatedAssistantModel();
    $user = grantProjectSettingsPermissions(User::factory()->create(), [
        PermissionEnum::CanManageProjectSettings->value,
    ]);

    $this->actingAs($user)
        ->put(route('ai-tools.update'), ['write_tools' => []])
        ->assertRedirect(route('ai-tools.edit'))
        ->assertSessionHas('success')
        ->assertSessionHas('warning', fn (string $warning): bool => str_contains($warning, 'claude-retired-1'));
});

it('saves AI settings without a warning when no configured model is deprecated', function (): void {
    $user = grantProjectSettingsPermissions(User::factory()->create(), [
        PermissionEnum::CanManageProjectSettings->value,
    ]);

    $this->actingAs($user)
        ->put(route('ai-tools.update'), ['write_tools' => []])
        ->assertRedirect(route('ai-tools.edit'))
        ->assertSessionHas('success')
        ->assertSessionMissing('warning');
});
