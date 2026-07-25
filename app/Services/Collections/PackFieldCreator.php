<?php

namespace App\Services\Collections;

use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Support\Collections\CollectionFieldSettingsPipeline;
use InvalidArgumentException;

/**
 * Create-or-skip collection fields from curated pack definitions.
 */
final class PackFieldCreator
{
    public function __construct(
        private readonly CollectionFieldSettingsPipeline $pipeline,
    ) {}

    /**
     * @param  list<array{name: string, type: string, translatable?: bool, settings?: array<string, mixed>|null}>  $definitions
     * @return array{
     *     created: list<array{id: int, name: string, type: string, translatable: bool}>,
     *     skipped: list<string>
     * }
     */
    public function createFromDefinitions(Collection $collection, array $definitions): array
    {
        $created = [];
        $skipped = [];

        foreach ($definitions as $fieldDef) {
            $name = $fieldDef['name'];

            if ($collection->fields()->where('name', $name)->exists()) {
                $skipped[] = $name;

                continue;
            }

            $type = FieldTypeEnum::from($fieldDef['type']);
            $settings = $this->pipeline->normalizeAndValidate(
                $fieldDef['settings'] ?? [],
                $type,
            );

            if (is_string($settings)) {
                // Curated packs should always validate; surface as hard failure.
                throw new InvalidArgumentException($settings);
            }

            $translatable = $type->supportsTranslatable() && (bool) ($fieldDef['translatable'] ?? false);

            $field = $collection->fields()->create([
                'name' => $name,
                'type' => $type,
                'translatable' => $translatable,
                'settings' => $settings === [] ? null : $settings,
            ]);

            $created[] = [
                'id' => $field->id,
                'name' => $field->name,
                'type' => $field->type->value,
                'translatable' => (bool) $field->translatable,
            ];
        }

        return [
            'created' => $created,
            'skipped' => $skipped,
        ];
    }
}
