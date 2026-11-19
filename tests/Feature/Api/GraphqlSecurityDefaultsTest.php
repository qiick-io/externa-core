<?php

declare(strict_types=1);

use App\Enums\CollectionPermissionActionEnum;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use GraphQL\Validator\Rules\DisableIntrospection;
use GraphQL\Validator\Rules\QueryComplexity;
use GraphQL\Validator\Rules\QueryDepth;

/**
 * Secure GraphQL defaults (measured against docs / Bruno / Pest queries):
 * max depth 1, max complexity 12 → defaults 7 / 50 with headroom.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    config([
        'lighthouse.validation_cache.enable' => false,
        'api.cost_limit' => 0,
    ]);
});

it('publishes secure depth and complexity defaults when env is unset', function (): void {
    expect(config('lighthouse.security.max_query_depth'))
        ->toBe(7)
        ->and(config('lighthouse.security.max_query_depth'))
        ->not->toBe(QueryDepth::DISABLED)
        ->and(config('lighthouse.security.max_query_complexity'))
        ->toBe(50)
        ->and(config('lighthouse.security.max_query_complexity'))
        ->not->toBe(QueryComplexity::DISABLED);
});

it('refuses a query deeper than the default max depth', function (): void {
    // webonyx QueryDepth for this document is 8 (> default 7).
    $response = $this->postJson('/api/graphql', [
        'query' => <<<'GRAPHQL'
            query DepthOverDefault {
              __schema {
                types {
                  fields {
                    type {
                      ofType {
                        ofType {
                          ofType {
                            ofType {
                              ofType {
                                name
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
            GRAPHQL,
    ]);

    expect($response->json('errors'))->not->toBeEmpty();
    $messages = collect($response->json('errors'))->pluck('message')->implode(' ');
    expect(strtolower($messages))->toContain('depth');
});

it('refuses a query above the default max complexity', function (): void {
    // Each alias is collections + 4 fields = complexity 5; 11 aliases = 55 (> default 50).
    $aliases = [];

    for ($index = 0; $index < 11; $index++) {
        $aliases[] = "a{$index}: collections { id slug name is_singleton }";
    }

    $response = $this->postJson('/api/graphql', [
        'query' => 'query ComplexityOverDefault { '.implode(' ', $aliases).' }',
    ]);

    expect($response->json('errors'))->not->toBeEmpty();
    $messages = collect($response->json('errors'))->pluck('message')->implode(' ');
    expect(strtolower($messages))->toContain('complexity');
});

it('allows the largest measured legitimate GraphQL query under the defaults', function (): void {
    $posts = makePostsCollection();
    grantPublicActions($posts, [CollectionPermissionActionEnum::Read]);

    // Docs "Query items (+ collection)" example — measured depth 1, complexity 12.
    $response = $this->postJson('/api/graphql', [
        'query' => <<<'GRAPHQL'
            query LargestLegitimate($slug: String!, $filter: JSON) {
              collection(slug: $slug) {
                id
                name
                is_singleton
              }
              items(collection: $slug, filter: $filter, perPage: 15) {
                data {
                  id
                  data
                  user_created_id
                }
                meta {
                  total
                  current_page
                }
              }
            }
            GRAPHQL,
        'variables' => [
            'slug' => 'posts',
            'filter' => null,
        ],
    ])->assertOk();

    expect($response->json('errors'))->toBeNull()
        ->and($response->json('data.collection.name'))->toBe('Posts')
        ->and($response->json('data.items.meta.total'))->toBe(0);
});

it('disables introspection by default when APP_ENV is production', function (): void {
    $previousAppEnv = $_ENV['APP_ENV'] ?? null;
    $previousOverride = $_ENV['LIGHTHOUSE_SECURITY_DISABLE_INTROSPECTION'] ?? null;

    try {
        putenv('APP_ENV=production');
        $_ENV['APP_ENV'] = 'production';
        $_SERVER['APP_ENV'] = 'production';
        putenv('LIGHTHOUSE_SECURITY_DISABLE_INTROSPECTION');
        unset($_ENV['LIGHTHOUSE_SECURITY_DISABLE_INTROSPECTION'], $_SERVER['LIGHTHOUSE_SECURITY_DISABLE_INTROSPECTION']);

        $lighthouseConfig = require base_path('config/lighthouse.php');

        expect($lighthouseConfig['security']['disable_introspection'])
            ->toBe(DisableIntrospection::ENABLED);
    } finally {
        if ($previousAppEnv === null) {
            putenv('APP_ENV');
            unset($_ENV['APP_ENV'], $_SERVER['APP_ENV']);
        } else {
            putenv('APP_ENV='.$previousAppEnv);
            $_ENV['APP_ENV'] = $previousAppEnv;
            $_SERVER['APP_ENV'] = $previousAppEnv;
        }

        if ($previousOverride === null) {
            putenv('LIGHTHOUSE_SECURITY_DISABLE_INTROSPECTION');
            unset($_ENV['LIGHTHOUSE_SECURITY_DISABLE_INTROSPECTION'], $_SERVER['LIGHTHOUSE_SECURITY_DISABLE_INTROSPECTION']);
        } else {
            putenv('LIGHTHOUSE_SECURITY_DISABLE_INTROSPECTION='.$previousOverride);
            $_ENV['LIGHTHOUSE_SECURITY_DISABLE_INTROSPECTION'] = $previousOverride;
            $_SERVER['LIGHTHOUSE_SECURITY_DISABLE_INTROSPECTION'] = $previousOverride;
        }
    }
});

it('allows introspection by default when APP_ENV is not production', function (): void {
    $previousAppEnv = $_ENV['APP_ENV'] ?? null;
    $previousOverride = $_ENV['LIGHTHOUSE_SECURITY_DISABLE_INTROSPECTION'] ?? null;

    try {
        putenv('APP_ENV=local');
        $_ENV['APP_ENV'] = 'local';
        $_SERVER['APP_ENV'] = 'local';
        putenv('LIGHTHOUSE_SECURITY_DISABLE_INTROSPECTION');
        unset($_ENV['LIGHTHOUSE_SECURITY_DISABLE_INTROSPECTION'], $_SERVER['LIGHTHOUSE_SECURITY_DISABLE_INTROSPECTION']);

        $lighthouseConfig = require base_path('config/lighthouse.php');

        expect($lighthouseConfig['security']['disable_introspection'])
            ->toBe(DisableIntrospection::DISABLED);
    } finally {
        if ($previousAppEnv === null) {
            putenv('APP_ENV');
            unset($_ENV['APP_ENV'], $_SERVER['APP_ENV']);
        } else {
            putenv('APP_ENV='.$previousAppEnv);
            $_ENV['APP_ENV'] = $previousAppEnv;
            $_SERVER['APP_ENV'] = $previousAppEnv;
        }

        if ($previousOverride === null) {
            putenv('LIGHTHOUSE_SECURITY_DISABLE_INTROSPECTION');
            unset($_ENV['LIGHTHOUSE_SECURITY_DISABLE_INTROSPECTION'], $_SERVER['LIGHTHOUSE_SECURITY_DISABLE_INTROSPECTION']);
        } else {
            putenv('LIGHTHOUSE_SECURITY_DISABLE_INTROSPECTION='.$previousOverride);
            $_ENV['LIGHTHOUSE_SECURITY_DISABLE_INTROSPECTION'] = $previousOverride;
            $_SERVER['LIGHTHOUSE_SECURITY_DISABLE_INTROSPECTION'] = $previousOverride;
        }
    }
});

it('refuses introspection when production defaults apply', function (): void {
    config([
        'lighthouse.security.disable_introspection' => DisableIntrospection::ENABLED,
    ]);

    $response = $this->postJson('/api/graphql', [
        'query' => 'query { __schema { queryType { name } } }',
    ]);

    expect($response->json('errors'))->not->toBeEmpty();
    $messages = collect($response->json('errors'))->pluck('message')->implode(' ');
    expect(strtolower($messages))->toMatch('/introspection|__schema/');
});

it('allows introspection when non-production defaults apply', function (): void {
    config([
        'lighthouse.security.disable_introspection' => DisableIntrospection::DISABLED,
    ]);

    $response = $this->postJson('/api/graphql', [
        'query' => 'query { __schema { queryType { name } } }',
    ])->assertOk();

    expect($response->json('errors'))->toBeNull()
        ->and($response->json('data.__schema.queryType.name'))->toBeString();
});
