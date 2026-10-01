<?php

use App\Services\Settings\ProjectSettings;
use App\Services\Settings\SettingsRepository;
use Illuminate\Support\Facades\Cache;

it('serves OpenAPI 3 JSON without an API key', function (): void {
    $this->getJson('/api/v1/openapi.json')
        ->assertOk()
        ->assertHeader('content-type', 'application/json')
        ->assertJsonPath('openapi', '3.0.3')
        ->assertJsonPath('info.title', 'Externa Public CMS API')
        ->assertJsonStructure([
            'openapi',
            'info' => ['title', 'version'],
            'paths',
            'components' => ['securitySchemes'],
        ])
        ->assertJsonPath('paths./collections.get.operationId', 'listCollections');
});

it('serves OpenAPI even when the public API origin allowlist is set', function (): void {
    Cache::forget(ProjectSettings::PUBLIC_API_ORIGINS_CACHE_KEY);
    app(SettingsRepository::class)->set(
        SettingsRepository::SCOPE_PROJECT,
        'project',
        'public_api_allowed_origins',
        ['https://app.example'],
    );
    app(ProjectSettings::class)->forgetPublicApiAllowedOriginsCache();

    $this->getJson('/api/v1/openapi.json')
        ->assertOk()
        ->assertJsonPath('openapi', '3.0.3');
});
