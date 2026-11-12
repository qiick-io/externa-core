<?php

declare(strict_types=1);

use App\Ai\Agents\ItemDraftWriter;
use App\Enums\FieldTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia;
use Spatie\Activitylog\Models\Activity;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    config()->set('ai.item_drafts.enabled', true);

    $this->collection = Collection::factory()->create(['name' => 'Posts', 'is_singleton' => false]);
    CollectionField::factory()->create([
        'collection_id' => $this->collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
        'settings' => ['max_length' => 20],
    ]);
    CollectionField::factory()->create([
        'collection_id' => $this->collection->id,
        'name' => 'summary',
        'type' => FieldTypeEnum::Textarea,
        'translatable' => true,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $this->collection->id,
        'name' => 'category',
        'type' => FieldTypeEnum::Select,
        'settings' => ['options' => [['value' => 'news', 'label' => 'News'], ['value' => 'blog', 'label' => 'Blog']]],
    ]);
    CollectionField::factory()->create([
        'collection_id' => $this->collection->id,
        'name' => 'tags',
        'type' => FieldTypeEnum::Tag,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $this->collection->id,
        'name' => 'rating',
        'type' => FieldTypeEnum::Number,
    ]);
});

function itemDraftEditor(array $extraPermissions = [PermissionEnum::CanUseAiItemDrafts->value]): User
{
    return grantAiPermissions(User::factory()->create(), [...allCollectionPermissions(), ...$extraPermissions]);
}

function postItemDraft(Collection $collection, array $payload = []): TestResponse
{
    return test()->postJson(
        route('collections.items.ai-draft', $collection),
        [...['prompt' => 'A short post about the spring release', 'locale' => 'it'], ...$payload],
    );
}

test('the endpoint answers 404 while AI item drafts are off, even for a permitted user', function () {
    config()->set('ai.item_drafts.enabled', false);
    ItemDraftWriter::fake()->preventStrayPrompts();
    $this->actingAs(itemDraftEditor());

    postItemDraft($this->collection)->assertNotFound();

    ItemDraftWriter::assertNeverPrompted();
});

test('the ai.draft permission is required', function () {
    ItemDraftWriter::fake()->preventStrayPrompts();
    $this->actingAs(itemDraftEditor([PermissionEnum::CanUseAi->value]));

    postItemDraft($this->collection)->assertForbidden();

    ItemDraftWriter::assertNeverPrompted();
});

test('the collection create or update ability is required', function () {
    ItemDraftWriter::fake()->preventStrayPrompts();
    $this->actingAs(grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanShowCollections->value,
        PermissionEnum::CanUseAiItemDrafts->value,
    ]));

    postItemDraft($this->collection)->assertForbidden();
});

test('the prompt and a content locale are validated', function () {
    ItemDraftWriter::fake()->preventStrayPrompts();
    $this->actingAs(itemDraftEditor());

    postItemDraft($this->collection, ['prompt' => '', 'locale' => 'fr'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['prompt', 'locale']);

    postItemDraft($this->collection, ['prompt' => str_repeat('a', 2001)])
        ->assertJsonValidationErrors(['prompt']);
});

test('valid values are returned and invalid ones are dropped and reported', function () {
    ItemDraftWriter::fake([[
        'title' => 'Spring release',
        'summary' => 'Tutte le novità della release di primavera.',
        'category' => 'press',
        'tags' => ['release', 'spring'],
        'rating' => 5,
    ]])->preventStrayPrompts();
    $this->actingAs(itemDraftEditor());

    postItemDraft($this->collection)
        ->assertOk()
        ->assertExactJson([
            'data' => [
                'title' => 'Spring release',
                'summary' => 'Tutte le novità della release di primavera.',
                'tags' => ['release', 'spring'],
            ],
            'dropped' => [
                ['field' => 'category', 'reason' => 'The selected data.category is invalid.'],
            ],
        ]);

    ItemDraftWriter::assertPrompted(
        fn ($prompt): bool => str_contains((string) $prompt->prompt, 'Locale: it')
            && str_contains((string) $prompt->prompt, 'spring release'),
    );
});

test('values over the field length limit are dropped', function () {
    ItemDraftWriter::fake([['title' => str_repeat('x', 21)]])->preventStrayPrompts();
    $this->actingAs(itemDraftEditor());

    postItemDraft($this->collection)
        ->assertOk()
        ->assertJsonPath('data', [])
        ->assertJsonPath('dropped.0.field', 'title');
});

test('a draft persists nothing and logs usage without content', function () {
    ItemDraftWriter::fake([['title' => 'Spring release']])->preventStrayPrompts();
    $user = itemDraftEditor();
    $this->actingAs($user);

    postItemDraft($this->collection)->assertOk();

    expect(CollectionItem::query()->count())->toBe(0);

    $activity = Activity::query()->where('event', 'ai_item_draft')->sole();

    expect($activity->causer_id)->toBe($user->id)
        ->and($activity->subject_id)->toBe($this->collection->id)
        ->and($activity->properties->get('prompt_length'))->toBe(mb_strlen('A short post about the spring release'))
        ->and($activity->properties->get('filled_fields'))->toBe(['title'])
        ->and($activity->properties->toJson())->not->toContain('Spring release')
        ->and($activity->properties->toJson())->not->toContain('spring release');
});

test('the item editor gets the AI draft flag only when the feature is on and permitted', function () {
    $this->withoutVite();
    $this->actingAs(itemDraftEditor());

    $this->get(route('collections.items.new', $this->collection))
        ->assertInertia(fn (AssertableInertia $page) => $page->where('canUseAiDrafts', true));

    config()->set('ai.item_drafts.enabled', false);

    $this->get(route('collections.items.new', $this->collection))
        ->assertInertia(fn (AssertableInertia $page) => $page->where('canUseAiDrafts', false));

    config()->set('ai.item_drafts.enabled', true);
    $this->actingAs(itemDraftEditor([]));

    $this->get(route('collections.items.new', $this->collection))
        ->assertInertia(fn (AssertableInertia $page) => $page->where('canUseAiDrafts', false));
});

test('a collection without draftable fields answers 422 without prompting', function () {
    ItemDraftWriter::fake()->preventStrayPrompts();
    $collection = Collection::factory()->create(['is_singleton' => false]);
    CollectionField::factory()->create(['collection_id' => $collection->id, 'type' => FieldTypeEnum::Number]);
    $this->actingAs(itemDraftEditor());

    postItemDraft($collection)->assertUnprocessable()->assertJsonValidationErrors(['prompt']);

    ItemDraftWriter::assertNeverPrompted();
});

test('a provider failure answers 502 without leaking details', function () {
    ItemDraftWriter::fake(function (): never {
        throw new RuntimeException('connection refused at http://10.0.0.5');
    });
    $this->actingAs(itemDraftEditor());

    postItemDraft($this->collection)
        ->assertStatus(502)
        ->assertJsonMissing(['message' => 'connection refused at http://10.0.0.5'])
        ->assertJsonPath('message', 'The AI draft could not be generated. Try again later.');
});
