<?php

declare(strict_types=1);

use App\Enums\CollectionPermissionActionEnum;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use GraphQL\Validator\Rules\DisableIntrospection;
use GraphQL\Validator\Rules\QueryComplexity;
use GraphQL\Validator\Rules\QueryDepth;

/**
 * Secure GraphQL defaults: abuse caps with headroom for real CMS clients.
 *
 * Heaviest legitimate query (collection + items at API_MAX_PER_PAGE with every
 * Item scalar and full PageMeta): depth 1, complexity 20. Schema has no nested
 * relation/file GraphQL fields (those live in data: JSON). Defaults 15 / 2000.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    config([
        'lighthouse.validation_cache.enable' => false,
        'api.cost_limit' => 0,
        'api.max_per_page' => 100,
    ]);
});

it('publishes secure depth and complexity defaults when env is unset', function (): void {
    expect(config('lighthouse.security.max_query_depth'))
        ->toBe(15)
        ->and(config('lighthouse.security.max_query_depth'))
        ->not->toBe(QueryDepth::DISABLED)
        ->and(config('lighthouse.security.max_query_complexity'))
        ->toBe(2000)
        ->and(config('lighthouse.security.max_query_complexity'))
        ->not->toBe(QueryComplexity::DISABLED);
});

it('refuses a query deeper than the default max depth', function (): void {
    // Nested introspection ofType chain → webonyx depth 16 (> default 15).
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
                                ofType {
                                  ofType {
                                    ofType {
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
    // Full items selection ≈ complexity 15; 134 aliases ≈ 2010 (> default 2000).
    $aliases = [];

    for ($index = 0; $index < 134; $index++) {
        $aliases[] = "a{$index}: items(collection: \"posts\", perPage: 100) { data { id collection_id data created_at updated_at published_at user_created_id user_updated_id } meta { current_page last_page per_page total } }";
    }

    $response = $this->postJson('/api/graphql', [
        'query' => 'query ComplexityOverDefault { '.implode(' ', $aliases).' }',
    ]);

    expect($response->json('errors'))->not->toBeEmpty();
    $messages = collect($response->json('errors'))->pluck('message')->implode(' ');
    expect(strtolower($messages))->toContain('complexity');
});

it('allows the heaviest legitimate GraphQL query under the defaults', function (): void {
    $posts = makePostsCollection();
    grantPublicActions($posts, [CollectionPermissionActionEnum::Read]);

    // Max page size, every Item scalar, full PageMeta, plus collection.
    // Relations/files/translations are not separate GraphQL fields (data: JSON).
    // Measured: depth 1, complexity 20 (perPage does not multiply without @paginate).
    $response = $this->postJson('/api/graphql', [
        'query' => <<<'GRAPHQL'
            query HeaviestLegitimate($slug: String!) {
              collection(slug: $slug) {
                id
                name
                slug
                is_singleton
              }
              items(collection: $slug, perPage: 100, page: 1) {
                data {
                  id
                  collection_id
                  data
                  created_at
                  updated_at
                  published_at
                  user_created_id
                  user_updated_id
                }
                meta {
                  current_page
                  last_page
                  per_page
                  total
                }
              }
            }
            GRAPHQL,
        'variables' => [
            'slug' => 'posts',
        ],
    ])->assertOk();

    expect($response->json('errors'))->toBeNull()
        ->and($response->json('data.collection.name'))->toBe('Posts')
        ->and($response->json('data.items.meta.per_page'))->toBe(100)
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
