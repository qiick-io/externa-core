<?php

namespace Database\Seeders;

use App\Enums\CollectionPermissionAction;
use App\Enums\FieldTypeEnum;
use App\Enums\FileTypeEnum;
use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\CollectionPermission;
use App\Models\File;
use App\Models\Role;
use App\Models\User;
use App\Models\UserGroup;
use App\Services\Collections\ApplyCollectionPackService;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesWriter;
use App\Services\Collections\PackFieldCreator;
use App\Services\Settings\SettingsRepository;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Spatie\Permission\Models\Permission;

/**
 * Rich local/demo CMS dataset: collection packs, relation-heavy siblings,
 * volume items, users/groups. Opt-in via SEED_DEMO_RICH=1 or
 * `php artisan db:seed --class=DemoSeeder`.
 *
 * Also runs KitchenSinkSeeder when the gitignored local QA assets exist.
 */
class DemoSeeder extends Seeder
{
    private const USERS = 48;

    private const ARTICLES = 80;

    private const PRODUCTS = 60;

    private const PAGES = 40;

    private const CATEGORIES = 16;

    private const AUTHORS = 24;

    private const TAGS = 40;

    private const COMMENTS = 120;

    private const EVENTS = 50;

    private const SEO = 40;

    private const FILES = 16;

    public function run(): void
    {
        config(['ai.embeddings.enabled' => false]);

        $this->configureLocales();
        $this->seedKitchenSinkIfPresent();

        $packs = app(ApplyCollectionPackService::class);
        $packs->apply('articles');
        $packs->apply('pages');
        $packs->apply('products');

        $authors = $this->ensureAuthors();
        $tags = $this->ensureTags();
        $comments = $this->ensureComments();
        $events = $this->ensureEvents();

        $articles = Collection::query()->where('slug', 'articles')->firstOrFail();
        $pages = Collection::query()->where('slug', 'pages')->firstOrFail();
        $products = Collection::query()->where('slug', 'products')->firstOrFail();
        $categories = Collection::query()->where('slug', 'categories')->firstOrFail();
        $seo = Collection::query()->where('slug', 'seo')->firstOrFail();

        $this->wireExtraRelations($articles, $authors, $tags, $pages, $products);
        $this->wireCommentRelations($comments, $articles, $authors);
        $this->wireEventRelations($events, $products, $authors);

        $files = $this->seedFiles();

        $categoryIds = $this->seedCategories($categories);
        $authorIds = $this->seedAuthors($authors, $files);
        $tagIds = $this->seedTags($tags);
        $seoIds = $this->seedSeo($seo);
        $pageIds = $this->seedPages($pages, $seoIds);
        $productIds = $this->seedProducts($products, $categoryIds, $seoIds, $files);
        $articleIds = $this->seedArticles($articles, $categoryIds, $seoIds, $authorIds, $tagIds, $pageIds, $productIds, $files);
        $this->seedComments($comments, $articleIds, $authorIds);
        $this->seedEvents($events, $productIds, $authorIds);

        $this->seedUsersAndGroups();
        $this->seedCollectionPermissions(
            [$articles, $pages, $products, $categories, $authors, $tags, $comments, $events, $seo],
        );

        $this->command?->info(sprintf(
            'Demo seeded: collections=%d users=%d groups=%d.',
            Collection::query()->count(),
            User::query()->count(),
            UserGroup::query()->count(),
        ));
    }

    private function configureLocales(): void
    {
        app(SettingsRepository::class)->setMany(SettingsRepository::SCOPE_PROJECT, 'project', [
            'content_locales' => ['en', 'it'],
            'default_content_locale' => 'en',
            'fallback_content_locales' => ['en', 'it'],
        ]);
    }

    /**
     * Kitchen Sink JSON + seeder are gitignored local QA assets — skip when absent.
     */
    private function seedKitchenSinkIfPresent(): void
    {
        if (! is_file(database_path('data/kitchen-sink.json'))) {
            return;
        }

        if (! class_exists(KitchenSinkSeeder::class)) {
            return;
        }

        $this->call(KitchenSinkSeeder::class);
    }

    private function ensureAuthors(): Collection
    {
        return $this->ensureCollection('authors', 'Authors', [
            [
                'name' => 'name',
                'type' => FieldTypeEnum::String->value,
                'translatable' => true,
                'settings' => ['display_name' => ['en' => 'Name'], 'required' => true],
            ],
            [
                'name' => 'slug',
                'type' => FieldTypeEnum::String->value,
                'translatable' => false,
                'settings' => ['display_name' => ['en' => 'Slug'], 'slugify' => true],
            ],
            [
                'name' => 'bio',
                'type' => FieldTypeEnum::Textarea->value,
                'translatable' => true,
                'settings' => ['display_name' => ['en' => 'Bio']],
            ],
            [
                'name' => 'email',
                'type' => FieldTypeEnum::String->value,
                'translatable' => false,
                'settings' => ['display_name' => ['en' => 'Email']],
            ],
            [
                'name' => 'avatar',
                'type' => FieldTypeEnum::Image->value,
                'translatable' => false,
                'settings' => ['display_name' => ['en' => 'Avatar']],
            ],
        ]);
    }

    private function ensureTags(): Collection
    {
        return $this->ensureCollection('tags', 'Tags', [
            [
                'name' => 'name',
                'type' => FieldTypeEnum::String->value,
                'translatable' => true,
                'settings' => ['display_name' => ['en' => 'Name'], 'required' => true],
            ],
            [
                'name' => 'slug',
                'type' => FieldTypeEnum::String->value,
                'translatable' => false,
                'settings' => ['display_name' => ['en' => 'Slug']],
            ],
        ]);
    }

    private function ensureComments(): Collection
    {
        return $this->ensureCollection('comments', 'Comments', [
            [
                'name' => 'body',
                'type' => FieldTypeEnum::Textarea->value,
                'translatable' => false,
                'settings' => ['display_name' => ['en' => 'Body'], 'required' => true],
            ],
            [
                'name' => 'rating',
                'type' => FieldTypeEnum::Number->value,
                'translatable' => false,
                'settings' => ['display_name' => ['en' => 'Rating'], 'min' => 1, 'max' => 5],
            ],
            [
                'name' => 'status',
                'type' => FieldTypeEnum::Select->value,
                'translatable' => false,
                'settings' => [
                    'display_name' => ['en' => 'Status'],
                    'options' => [
                        ['value' => 'pending', 'label' => 'Pending'],
                        ['value' => 'approved', 'label' => 'Approved'],
                        ['value' => 'spam', 'label' => 'Spam'],
                    ],
                    'default_value' => 'pending',
                ],
            ],
        ]);
    }

    private function ensureEvents(): Collection
    {
        return $this->ensureCollection('events', 'Events', [
            [
                'name' => 'title',
                'type' => FieldTypeEnum::String->value,
                'translatable' => true,
                'settings' => ['display_name' => ['en' => 'Title'], 'required' => true],
            ],
            [
                'name' => 'slug',
                'type' => FieldTypeEnum::String->value,
                'translatable' => false,
                'settings' => ['display_name' => ['en' => 'Slug']],
            ],
            [
                'name' => 'summary',
                'type' => FieldTypeEnum::Textarea->value,
                'translatable' => true,
                'settings' => ['display_name' => ['en' => 'Summary']],
            ],
            [
                'name' => 'starts_at',
                'type' => FieldTypeEnum::Date->value,
                'translatable' => false,
                'settings' => ['display_name' => ['en' => 'Starts at'], 'date_mode' => 'datetime'],
            ],
            [
                'name' => 'venue',
                'type' => FieldTypeEnum::String->value,
                'translatable' => false,
                'settings' => ['display_name' => ['en' => 'Venue']],
            ],
            [
                'name' => 'map',
                'type' => FieldTypeEnum::Map->value,
                'translatable' => false,
                'settings' => [
                    'display_name' => ['en' => 'Map'],
                    'default_lat' => 45.4642,
                    'default_lng' => 9.19,
                    'geometry_mode' => 'point',
                ],
            ],
        ]);
    }

    /**
     * @param  list<array{name: string, type: string, translatable?: bool, settings?: array<string, mixed>|null}>  $fields
     */
    private function ensureCollection(string $slug, string $name, array $fields): Collection
    {
        $collection = Collection::query()->firstOrCreate(
            ['slug' => $slug],
            [
                'name' => $name,
                'description' => 'Demo CMS collection',
                'status' => 'active',
                'is_singleton' => false,
                'versioning' => false,
                'sort_order' => 20,
            ],
        );

        app(PackFieldCreator::class)->createFromDefinitions($collection, $fields);

        return $collection->fresh(['fields']);
    }

    private function wireExtraRelations(
        Collection $articles,
        Collection $authors,
        Collection $tags,
        Collection $pages,
        Collection $products,
    ): void {
        app(PackFieldCreator::class)->createFromDefinitions($articles, [
            [
                'name' => 'author',
                'type' => FieldTypeEnum::ManyToOne->value,
                'translatable' => false,
                'settings' => [
                    'display_name' => ['en' => 'Author'],
                    'related_collection_id' => $authors->id,
                    'display_field' => 'name',
                ],
            ],
            [
                'name' => 'tags',
                'type' => FieldTypeEnum::ManyToMany->value,
                'translatable' => false,
                'settings' => [
                    'display_name' => ['en' => 'Tags'],
                    'related_collection_id' => $tags->id,
                    'display_field' => 'name',
                ],
            ],
            [
                'name' => 'related_articles',
                'type' => FieldTypeEnum::OneToMany->value,
                'translatable' => false,
                'settings' => [
                    'display_name' => ['en' => 'Related articles'],
                    'related_collection_id' => $articles->id,
                    'display_field' => 'title',
                    'layout' => 'list',
                ],
            ],
            [
                'name' => 'modules',
                'type' => FieldTypeEnum::M2a->value,
                'translatable' => false,
                'settings' => [
                    'display_name' => ['en' => 'Modules'],
                    'allowed_collection_ids' => [$pages->id, $products->id],
                    'allow_duplicates' => false,
                ],
            ],
        ]);
    }

    private function wireCommentRelations(Collection $comments, Collection $articles, Collection $authors): void
    {
        app(PackFieldCreator::class)->createFromDefinitions($comments, [
            [
                'name' => 'article',
                'type' => FieldTypeEnum::ManyToOne->value,
                'translatable' => false,
                'settings' => [
                    'display_name' => ['en' => 'Article'],
                    'related_collection_id' => $articles->id,
                    'display_field' => 'title',
                ],
            ],
            [
                'name' => 'author',
                'type' => FieldTypeEnum::ManyToOne->value,
                'translatable' => false,
                'settings' => [
                    'display_name' => ['en' => 'Author'],
                    'related_collection_id' => $authors->id,
                    'display_field' => 'name',
                ],
            ],
        ]);
    }

    private function wireEventRelations(Collection $events, Collection $products, Collection $authors): void
    {
        app(PackFieldCreator::class)->createFromDefinitions($events, [
            [
                'name' => 'products',
                'type' => FieldTypeEnum::ManyToMany->value,
                'translatable' => false,
                'settings' => [
                    'display_name' => ['en' => 'Products'],
                    'related_collection_id' => $products->id,
                    'display_field' => 'title',
                ],
            ],
            [
                'name' => 'host',
                'type' => FieldTypeEnum::ManyToOne->value,
                'translatable' => false,
                'settings' => [
                    'display_name' => ['en' => 'Host'],
                    'related_collection_id' => $authors->id,
                    'display_field' => 'name',
                ],
            ],
        ]);
    }

    /**
     * @return list<int>
     */
    private function seedFiles(): array
    {
        $ids = File::query()->where('path', 'like', '/demo/%')->orderBy('id')->pluck('id')->all();
        if (count($ids) >= self::FILES) {
            return array_slice($ids, 0, self::FILES);
        }

        for ($i = count($ids) + 1; $i <= self::FILES; $i++) {
            $name = sprintf('demo-cover-%02d.jpg', $i);
            $file = File::query()->create([
                'type' => FileTypeEnum::File,
                'name' => $name,
                'title' => 'Demo cover '.$i,
                'path' => '/demo/'.$name,
                'disk' => 'assets',
                'storage_path' => 'demo/'.$name,
                'mime_type' => 'image/jpeg',
                'extension' => 'jpg',
                'size' => 1024 + $i,
                'width' => 1200,
                'height' => 800,
                'hash' => hash('sha256', 'demo-file-'.$i),
            ]);
            $ids[] = $file->id;
        }

        return $ids;
    }

    /**
     * @return list<int>
     */
    private function seedCategories(Collection $collection): array
    {
        return $this->fillItems($collection, self::CATEGORIES, function (int $i): array {
            $slug = 'category-'.$i;

            return [
                'name' => ['en' => 'Category '.$i, 'it' => 'Categoria '.$i],
                'slug' => $slug,
                'description' => [
                    'en' => 'English description for category '.$i,
                    'it' => 'Descrizione italiana per categoria '.$i,
                ],
            ];
        });
    }

    /**
     * @param  list<int>  $files
     * @return list<int>
     */
    private function seedAuthors(Collection $collection, array $files): array
    {
        return $this->fillItems($collection, self::AUTHORS, function (int $i) use ($files): array {
            $data = [
                'name' => ['en' => 'Author '.$i, 'it' => 'Autore '.$i],
                'slug' => 'author-'.$i,
                'bio' => [
                    'en' => fake()->paragraph(),
                    'it' => 'Bio IT '.$i.'. '.fake()->sentence(),
                ],
                'email' => sprintf('author-%02d@demo.externa.test', $i),
            ];
            if ($files !== []) {
                $data['avatar'] = $files[($i - 1) % count($files)];
            }

            return $data;
        });
    }

    /**
     * @return list<int>
     */
    private function seedTags(Collection $collection): array
    {
        return $this->fillItems($collection, self::TAGS, function (int $i): array {
            return [
                'name' => ['en' => 'Tag '.$i, 'it' => 'Etichetta '.$i],
                'slug' => 'tag-'.$i,
            ];
        });
    }

    /**
     * @return list<int>
     */
    private function seedSeo(Collection $collection): array
    {
        return $this->fillItems($collection, self::SEO, function (int $i): array {
            return [
                'title' => ['en' => 'SEO Title '.$i, 'it' => 'Titolo SEO '.$i],
                'description' => [
                    'en' => 'Meta description '.$i,
                    'it' => 'Meta descrizione '.$i,
                ],
                'keywords' => ['en' => 'demo, seo, '.$i, 'it' => 'demo, seo, '.$i],
                'canonical' => 'https://example.test/seo/'.$i,
                'robots' => 'index, follow',
                'noindex' => false,
            ];
        });
    }

    /**
     * @param  list<int>  $seoIds
     * @return list<int>
     */
    private function seedPages(Collection $pages, array $seoIds): array
    {
        $statuses = ['draft', 'published', 'archived'];

        return $this->fillItems($pages, self::PAGES, function (int $i) use ($seoIds, $statuses): array {
            $data = [
                'title' => ['en' => 'Page '.$i, 'it' => 'Pagina '.$i],
                'slug' => 'page-'.$i,
                'status' => $statuses[($i - 1) % count($statuses)],
                'published_at' => now()->subDays($i)->toIso8601String(),
                'body' => [
                    [
                        'id' => (string) Str::uuid(),
                        'type' => 'section',
                        'data' => [
                            'heading' => ['en' => 'Section '.$i, 'it' => 'Sezione '.$i],
                        ],
                    ],
                    [
                        'id' => (string) Str::uuid(),
                        'type' => 'rich_text',
                        'data' => [
                            'body' => [
                                'en' => '<p>'.fake()->paragraph().'</p>',
                                'it' => '<p>IT '.fake()->sentence().'</p>',
                            ],
                        ],
                    ],
                ],
            ];
            if ($seoIds !== []) {
                $data['seo'] = $seoIds[($i - 1) % count($seoIds)];
            }

            return $data;
        });
    }

    /**
     * @param  list<int>  $categoryIds
     * @param  list<int>  $seoIds
     * @param  list<int>  $files
     * @return list<int>
     */
    private function seedProducts(Collection $products, array $categoryIds, array $seoIds, array $files): array
    {
        $statuses = ['draft', 'published', 'archived'];

        return $this->fillItems($products, self::PRODUCTS, function (int $i) use ($categoryIds, $seoIds, $files, $statuses): array {
            $data = [
                'title' => ['en' => 'Product '.$i, 'it' => 'Prodotto '.$i],
                'slug' => 'product-'.$i,
                'description' => [
                    'en' => fake()->paragraph(),
                    'it' => 'Descrizione prodotto '.$i,
                ],
                'price' => 9.99 + $i,
                'status' => $statuses[($i - 1) % count($statuses)],
            ];
            if ($files !== []) {
                $pick = array_slice($files, 0, min(2, count($files)));
                $data['images'] = count($pick) === 1 ? $pick[0] : $pick;
            }
            if ($categoryIds !== []) {
                $data['category'] = $categoryIds[($i - 1) % count($categoryIds)];
            }
            if ($seoIds !== []) {
                $data['seo'] = $seoIds[($i - 1) % count($seoIds)];
            }

            return $data;
        });
    }

    /**
     * @param  list<int>  $categoryIds
     * @param  list<int>  $seoIds
     * @param  list<int>  $authorIds
     * @param  list<int>  $tagIds
     * @param  list<int>  $pageIds
     * @param  list<int>  $productIds
     * @param  list<int>  $files
     * @return list<int>
     */
    private function seedArticles(
        Collection $articles,
        array $categoryIds,
        array $seoIds,
        array $authorIds,
        array $tagIds,
        array $pageIds,
        array $productIds,
        array $files,
    ): array {
        $statuses = ['draft', 'published', 'archived'];
        $createdIds = [];

        return $this->fillItems($articles, self::ARTICLES, function (int $i) use (
            $categoryIds,
            $seoIds,
            $authorIds,
            $tagIds,
            $pageIds,
            $productIds,
            $files,
            $statuses,
            &$createdIds,
        ): array {
            $data = [
                'title' => ['en' => 'Article '.$i, 'it' => 'Articolo '.$i],
                'slug' => 'article-'.$i,
                'excerpt' => [
                    'en' => fake()->sentence(16),
                    'it' => 'Estratto '.$i.'. '.fake()->sentence(),
                ],
                'status' => $statuses[($i - 1) % count($statuses)],
                'published_at' => now()->subDays($i)->toIso8601String(),
                'body' => [
                    [
                        'id' => (string) Str::uuid(),
                        'type' => 'rich_text',
                        'data' => [
                            'body' => [
                                'en' => '<p>'.fake()->paragraphs(2, true).'</p>',
                                'it' => '<p>IT '.fake()->paragraph().'</p>',
                            ],
                        ],
                    ],
                ],
            ];

            if ($files !== []) {
                $data['cover'] = $files[($i - 1) % count($files)];
            }
            if ($categoryIds !== []) {
                $data['category'] = $categoryIds[($i - 1) % count($categoryIds)];
            }
            if ($seoIds !== []) {
                $data['seo'] = $seoIds[($i - 1) % count($seoIds)];
            }
            if ($authorIds !== []) {
                $data['author'] = $authorIds[($i - 1) % count($authorIds)];
            }
            if ($tagIds !== []) {
                $picked = array_slice($tagIds, ($i - 1) % max(1, count($tagIds)), 3);
                if ($picked === []) {
                    $picked = array_slice($tagIds, 0, min(3, count($tagIds)));
                }
                $data['tags'] = array_map(
                    fn (int $id): array => ['related_item_id' => $id],
                    $picked,
                );
            }

            if ($createdIds !== [] && $i > 3 && $i % 5 === 0) {
                $data['related_articles'] = array_map(
                    fn (int $id): array => ['related_item_id' => $id],
                    array_slice($createdIds, -2),
                );
            }

            $modules = [];
            if ($pageIds !== []) {
                $modules[] = [
                    'related_collection_id' => Collection::query()->where('slug', 'pages')->value('id'),
                    'related_item_id' => $pageIds[($i - 1) % count($pageIds)],
                ];
            }
            if ($productIds !== [] && $i % 2 === 0) {
                $modules[] = [
                    'related_collection_id' => Collection::query()->where('slug', 'products')->value('id'),
                    'related_item_id' => $productIds[($i - 1) % count($productIds)],
                ];
            }
            if ($modules !== []) {
                $data['modules'] = $modules;
            }

            return $data;
        }, $createdIds);
    }

    /**
     * @param  list<int>  $articleIds
     * @param  list<int>  $authorIds
     */
    private function seedComments(Collection $comments, array $articleIds, array $authorIds): void
    {
        $statuses = ['pending', 'approved', 'spam'];

        $this->fillItems($comments, self::COMMENTS, function (int $i) use ($articleIds, $authorIds, $statuses): array {
            $data = [
                'body' => fake()->paragraph(),
                'rating' => (($i - 1) % 5) + 1,
                'status' => $statuses[($i - 1) % count($statuses)],
            ];
            if ($articleIds !== []) {
                $data['article'] = $articleIds[($i - 1) % count($articleIds)];
            }
            if ($authorIds !== []) {
                $data['author'] = $authorIds[($i - 1) % count($authorIds)];
            }

            return $data;
        });
    }

    /**
     * @param  list<int>  $productIds
     * @param  list<int>  $authorIds
     */
    private function seedEvents(Collection $events, array $productIds, array $authorIds): void
    {
        $this->fillItems($events, self::EVENTS, function (int $i) use ($productIds, $authorIds): array {
            $data = [
                'title' => ['en' => 'Event '.$i, 'it' => 'Evento '.$i],
                'slug' => 'event-'.$i,
                'summary' => [
                    'en' => fake()->sentence(12),
                    'it' => 'Riassunto evento '.$i,
                ],
                'starts_at' => now()->addDays($i)->toIso8601String(),
                'venue' => fake()->city().' Hall',
                'map' => ['lat' => 45.4 + ($i * 0.01), 'lng' => 9.1 + ($i * 0.01)],
            ];
            if ($authorIds !== []) {
                $data['host'] = $authorIds[($i - 1) % count($authorIds)];
            }
            if ($productIds !== []) {
                $picked = array_slice($productIds, 0, min(3, count($productIds)));
                $data['products'] = array_map(
                    fn (int $id): array => ['related_item_id' => $id],
                    $picked,
                );
            }

            return $data;
        });
    }

    /**
     * @param  callable(int): array<string, mixed>  $factory
     * @param  list<int>|null  $trackIds
     * @return list<int>
     */
    private function fillItems(Collection $collection, int $target, callable $factory, ?array &$trackIds = null): array
    {
        $collection->loadMissing('fields');
        $writer = app(CollectionItemValuesWriter::class);
        $normalizer = app(CollectionItemDataNormalizer::class);

        $ids = $collection->items()->orderBy('id')->pluck('id')->all();
        if ($trackIds !== null) {
            $trackIds = $ids;
        }

        $existing = count($ids);
        if ($existing >= $target) {
            return array_slice($ids, 0, $target);
        }

        for ($i = $existing + 1; $i <= $target; $i++) {
            $item = CollectionItem::query()->create(['collection_id' => $collection->id]);
            $writer->sync(
                $item,
                $collection,
                $normalizer->normalize($collection, $factory($i), true),
                true,
            );
            $ids[] = $item->id;
            if ($trackIds !== null) {
                $trackIds[] = $item->id;
            }
        }

        return $ids;
    }

    private function seedUsersAndGroups(): void
    {
        $guard = config('auth.defaults.guard', 'web');

        $editor = Role::query()->firstOrCreate(
            ['name' => 'demo-editor', 'guard_name' => $guard],
            ['is_system' => false, 'is_assignable' => true],
        );
        $authorRole = Role::query()->firstOrCreate(
            ['name' => 'demo-author', 'guard_name' => $guard],
            ['is_system' => false, 'is_assignable' => true],
        );
        $reviewer = Role::query()->firstOrCreate(
            ['name' => 'demo-reviewer', 'guard_name' => $guard],
            ['is_system' => false, 'is_assignable' => true],
        );

        $showPerms = collect(PermissionEnum::cases())
            ->filter(fn (PermissionEnum $p): bool => str_starts_with($p->value, 'can-show-'))
            ->map(fn (PermissionEnum $p): string => $p->value)
            ->all();
        $editorPerms = array_values(array_unique([
            ...$showPerms,
            PermissionEnum::CanShowCollections->value,
            PermissionEnum::CanCreateCollections->value,
            PermissionEnum::CanEditCollections->value,
            PermissionEnum::CanDeleteCollections->value,
            PermissionEnum::CanShowFiles->value,
            PermissionEnum::CanCreateFiles->value,
            PermissionEnum::CanEditFiles->value,
        ]));

        $all = Permission::query()->where('guard_name', $guard)->pluck('name')->all();
        $editor->syncPermissions($editorPerms);
        $authorRole->syncPermissions($showPerms);
        $reviewer->syncPermissions($showPerms);

        $password = Hash::make('password');
        $roleCycle = [
            RoleEnum::Admin->value,
            RoleEnum::Reader->value,
            'demo-editor',
            'demo-author',
            'demo-reviewer',
        ];

        for ($i = 1; $i <= self::USERS; $i++) {
            $email = sprintf('demo.user.%02d@externa.test', $i);
            $user = User::query()->updateOrCreate(
                ['email' => $email],
                [
                    'first_name' => fake()->firstName(),
                    'last_name' => fake()->lastName(),
                    'password' => $password,
                    'email_verified_at' => now(),
                    'is_active' => $i % 11 !== 0,
                ],
            );
            $user->syncRoles([$roleCycle[($i - 1) % count($roleCycle)]]);
        }

        // Keep one admin with full Spatie perms for convenience.
        $power = User::query()->where('email', 'demo.user.01@externa.test')->first();
        if ($power instanceof User) {
            $power->syncRoles([RoleEnum::Admin->value]);
            $power->syncPermissions($all);
        }

        $groups = [
            ['name' => 'Editorial', 'description' => 'Editors and authors', 'role' => 'demo-editor'],
            ['name' => 'Review Desk', 'description' => 'Content reviewers', 'role' => 'demo-reviewer'],
            ['name' => 'Readers Circle', 'description' => 'Read-only staff', 'role' => RoleEnum::Reader->value],
            ['name' => 'Ops Admins', 'description' => 'Admin operators', 'role' => RoleEnum::Admin->value],
            ['name' => 'Freelance Authors', 'description' => 'External contributors', 'role' => 'demo-author'],
        ];

        $users = User::query()->where('email', 'like', 'demo.user.%@externa.test')->orderBy('id')->get();
        $chunk = (int) ceil($users->count() / max(1, count($groups)));

        foreach ($groups as $index => $meta) {
            $group = UserGroup::query()->updateOrCreate(
                ['name' => $meta['name']],
                ['description' => $meta['description']],
            );
            $role = Role::query()->where('name', $meta['role'])->where('guard_name', $guard)->first();
            if ($role instanceof Role) {
                $group->roles()->syncWithoutDetaching([$role->id]);
            }
            $slice = $users->slice($index * $chunk, $chunk)->pluck('id')->all();
            if ($slice !== []) {
                $group->users()->syncWithoutDetaching($slice);
            }
        }
    }

    /**
     * @param  list<Collection>  $collections
     */
    private function seedCollectionPermissions(array $collections): void
    {
        $guard = config('auth.defaults.guard', 'web');
        $public = Role::query()->where('name', RoleEnum::Public->value)->where('guard_name', $guard)->first();
        $reader = Role::query()->where('name', RoleEnum::Reader->value)->where('guard_name', $guard)->first();
        $editor = Role::query()->where('name', 'demo-editor')->where('guard_name', $guard)->first();
        $author = Role::query()->where('name', 'demo-author')->where('guard_name', $guard)->first();
        $reviewer = Role::query()->where('name', 'demo-reviewer')->where('guard_name', $guard)->first();

        foreach ($collections as $collection) {
            if ($public instanceof Role) {
                $this->grant($public->id, $collection->id, [CollectionPermissionAction::Read]);
            }
            if ($reader instanceof Role) {
                $this->grant($reader->id, $collection->id, [CollectionPermissionAction::Read]);
            }
            if ($reviewer instanceof Role) {
                $this->grant($reviewer->id, $collection->id, [
                    CollectionPermissionAction::Read,
                    CollectionPermissionAction::Update,
                ]);
            }
            if ($author instanceof Role) {
                $this->grant($author->id, $collection->id, [
                    CollectionPermissionAction::Read,
                    CollectionPermissionAction::Create,
                    CollectionPermissionAction::Update,
                ]);
            }
            if ($editor instanceof Role) {
                $this->grant($editor->id, $collection->id, CollectionPermissionAction::cases());
            }
        }
    }

    /**
     * @param  list<CollectionPermissionAction>  $actions
     */
    private function grant(int $roleId, int $collectionId, array $actions): void
    {
        foreach ($actions as $action) {
            CollectionPermission::query()->updateOrCreate(
                [
                    'role_id' => $roleId,
                    'collection_id' => $collectionId,
                    'action' => $action->value,
                ],
                ['allowed' => true],
            );
        }
    }
}
