<?php

namespace Tests\Support;

use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\User;
use App\Services\Collections\CollectionItemValuesAssembler;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Shared helpers for Externa collection field-settings behavioral contracts.
 */
final class FieldSettingsTestHelpers
{
    public static function actingAsCollectionsAdmin(TestCase $test): User
    {
        $user = grantCollectionPermissions(User::factory()->create());
        $test->actingAs($user);

        return $user;
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    public static function makeCollection(): Collection
    {
        return Collection::factory()->create();
    }

    /**
     * @param  array<string, mixed>  $settings
     * @param  array<string, mixed>  $extra
     */
    public static function makeField(
        Collection $collection,
        string $name,
        FieldTypeEnum $type,
        array $settings = [],
        array $extra = [],
    ): CollectionField {
        return CollectionField::factory()->create([
            'collection_id' => $collection->id,
            'name' => $name,
            'type' => $type,
            'settings' => $settings,
            ...$extra,
        ]);
    }

    /**
     * @param  array<string, mixed>  $settings
     */
    public static function patchSettings(
        TestCase $test,
        Collection $collection,
        CollectionField $field,
        array $settings,
    ): TestResponse {
        return $test->patch(route('collections.fields.update', [$collection, $field]), [
            'settings' => $settings,
        ]);
    }

    /**
     * Persist settings then reload field and assert expected keys survive.
     *
     * @param  array<string, mixed>  $settings
     * @param  array<string, mixed>  $expected
     */
    public static function assertSettingsRoundtrip(
        TestCase $test,
        Collection $collection,
        CollectionField $field,
        array $settings,
        array $expected,
    ): CollectionField {
        self::patchSettings($test, $collection, $field, $settings)
            ->assertRedirect()
            ->assertSessionHasNoErrors();

        $fresh = $field->fresh();
        expect($fresh)->not->toBeNull();

        foreach ($expected as $key => $value) {
            if (is_bool($value)) {
                expect(CollectionField::settingsFlagIsEnabled(data_get($fresh->settings, $key)))
                    ->toBe($value, "settings.{$key} flag mismatch");
            } else {
                expect(data_get($fresh->settings, $key))->toEqual($value);
            }
        }

        return $fresh;
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public static function storeItem(TestCase $test, Collection $collection, array $data): TestResponse
    {
        return $test->post(route('collections.items.store', $collection), [
            'data' => $data,
        ]);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public static function updateItem(
        TestCase $test,
        Collection $collection,
        CollectionItem $item,
        array $data,
    ): TestResponse {
        return $test->put(route('collections.items.update', [$collection, $item]), [
            'data' => $data,
        ]);
    }

    public static function latestItem(Collection $collection): CollectionItem
    {
        $item = CollectionItem::query()->where('collection_id', $collection->id)->latest('id')->first();
        expect($item)->not->toBeNull();

        return $item;
    }

    /**
     * @return array<string, mixed>
     */
    public static function assemble(CollectionItem $item): array
    {
        return app(CollectionItemValuesAssembler::class)->assemble($item->fresh());
    }
}
