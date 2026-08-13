<?php

namespace App\Services\Collections;

use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Nesting helpers for layout group fields (`settings.group` = parent field name).
 *
 * Directus parity: any field may nest under any layout group (including leaf→
 * Accordion/Tabs directly). Accordion/Tabs treat each direct child as a panel
 * (group children expose nested fields; leaf children render as the panel body).
 */
class CollectionFieldGroupService
{
    /**
     * Accordion and Tabs use direct children as panels/sections (Directus).
     * Explicit Raw sections are still seeded for empty UX — not required on drop.
     */
    public function isPanelContainer(FieldTypeEnum $type): bool
    {
        return $type === FieldTypeEnum::GroupAccordion
            || $type === FieldTypeEnum::GroupTabs;
    }

    /**
     * Directus parity: any field type may nest under any layout group.
     * Cycle prevention stays in assertValidGroupParent / wouldCreateCycle.
     */
    public function canNestFieldIntoGroup(FieldTypeEnum $childType, FieldTypeEnum $parentType): bool
    {
        // $childType kept for call-site symmetry; Directus has no child-type gate.
        return $parentType->isLayoutGroup();
    }

    /**
     * Force full width on layout group fields (containers never half/fill).
     *
     * @param  array<string, mixed>  $settings
     * @return array<string, mixed>
     */
    public function forceFullWidthForGroup(FieldTypeEnum $type, array $settings): array
    {
        if ($type->isLayoutGroup()) {
            $settings['layout_width'] = 'full';
            unset($settings['layout_starts_new_row']);
        }

        return $settings;
    }

    /**
     * Seed empty Raw sections under a new Accordion/Tabs container.
     */
    public function seedDefaultPanelSections(
        Collection $collection,
        CollectionField $parent,
        int $count = 2,
    ): void {
        if (! $this->isPanelContainer($parent->type)) {
            return;
        }

        for ($index = 1; $index <= $count; $index++) {
            $this->createPanelSection($collection, $parent, $index);
        }
    }

    /**
     * Create a Raw section/tab panel nested under an Accordion or Tabs group.
     */
    public function createPanelSection(
        Collection $collection,
        CollectionField $parent,
        ?int $index = null,
    ): CollectionField {
        $index ??= $this->nextPanelSectionIndex($collection, $parent->name);
        $isTabs = $parent->type === FieldTypeEnum::GroupTabs;
        $baseName = $isTabs
            ? $parent->name.'_tab_'.$index
            : $parent->name.'_section_'.$index;
        $name = $this->uniqueFieldName($collection, $baseName);
        $label = $isTabs
            ? [
                'en' => 'Tab '.$index,
                'it' => 'Scheda '.$index,
                'de' => 'Tab '.$index,
            ]
            : [
                'en' => 'Section '.$index,
                'it' => 'Sezione '.$index,
                'de' => 'Abschnitt '.$index,
            ];

        /** @var CollectionField $section */
        $section = $collection->fields()->create([
            'name' => $name,
            'type' => FieldTypeEnum::GroupRaw,
            'translatable' => false,
            'settings' => [
                'layout_width' => 'full',
                'group' => $parent->name,
                'display_name' => $label,
            ],
        ]);

        return $section;
    }

    /**
     * Validate settings.group: parent exists, is a group, same collection, no cycles.
     *
     * @param  array<string, mixed>|null  $settings
     */
    public function assertValidGroupParent(
        Collection $collection,
        ?array $settings,
        ?CollectionField $field = null,
        ?FieldTypeEnum $type = null,
    ): void {
        $groupName = $this->groupNameFromSettings($settings);
        if ($groupName === null) {
            return;
        }

        $resolvedType = $type
            ?? ($field?->type instanceof FieldTypeEnum ? $field->type : null);

        if ($resolvedType?->isLayoutGroup() && $field !== null && $groupName === $field->name) {
            throw ValidationException::withMessages([
                'settings.group' => __('A group cannot nest under itself.'),
            ]);
        }

        $parent = CollectionField::query()
            ->where('collection_id', $collection->id)
            ->where('name', $groupName)
            ->first();

        if ($parent === null) {
            throw ValidationException::withMessages([
                'settings.group' => __('Parent group field :name was not found.', ['name' => $groupName]),
            ]);
        }

        if (! $parent->type->isLayoutGroup()) {
            throw ValidationException::withMessages([
                'settings.group' => __('Parent :name is not a layout group.', ['name' => $groupName]),
            ]);
        }

        if (
            $resolvedType !== null
            && ! $this->canNestFieldIntoGroup($resolvedType, $parent->type)
        ) {
            throw ValidationException::withMessages([
                'settings.group' => __(
                    'Parent :name is not a layout group.',
                    ['name' => $groupName],
                ),
            ]);
        }

        if ($field !== null && $this->wouldCreateCycle($collection, $field, $groupName)) {
            throw ValidationException::withMessages([
                'settings.group' => __('Nesting under :name would create a cycle.', ['name' => $groupName]),
            ]);
        }
    }

    /**
     * Clear settings.group on children that pointed at the deleted parent name.
     */
    public function ungroupChildren(Collection $collection, string $parentName): void
    {
        $fields = CollectionField::query()
            ->where('collection_id', $collection->id)
            ->get();

        foreach ($fields as $child) {
            if ($this->groupNameFromSettings($child->settings) !== $parentName) {
                continue;
            }

            $settings = $child->settings ?? [];
            unset($settings['group']);
            $child->update(['settings' => $settings === [] ? null : $settings]);
        }
    }

    /**
     * When a group field is renamed, rewrite children's settings.group pointers.
     */
    public function rewriteGroupNameReferences(Collection $collection, string $oldName, string $newName): void
    {
        if ($oldName === $newName) {
            return;
        }

        $fields = CollectionField::query()
            ->where('collection_id', $collection->id)
            ->get();

        foreach ($fields as $child) {
            if ($this->groupNameFromSettings($child->settings) !== $oldName) {
                continue;
            }

            $settings = $child->settings ?? [];
            $settings['group'] = $newName;
            $child->update(['settings' => $settings]);
        }
    }

    /**
     * Persist group nesting from a reorder payload map (field id => parent name|null).
     *
     * Directus parity: leaf→Accordion/Tabs nests directly (meta.group = panel name).
     * No mandatory Raw auto-wrap on drop. Cycle checks via assertValidGroupParent.
     *
     * @param  array<int|string, string|null>  $groupsById
     */
    public function applyGroupsFromReorder(Collection $collection, array $groupsById): void
    {
        if ($groupsById === []) {
            return;
        }

        // Validate first so a bad nest cannot partially ungroup siblings.
        DB::transaction(function () use ($collection, $groupsById): void {
            $fields = CollectionField::query()
                ->where('collection_id', $collection->id)
                ->whereIn('id', array_map('intval', array_keys($groupsById)))
                ->lockForUpdate()
                ->get()
                ->keyBy('id');

            foreach ($groupsById as $rawId => $groupName) {
                $id = (int) $rawId;
                $field = $fields->get($id);
                if ($field === null) {
                    continue;
                }

                $normalizedGroup = is_string($groupName) && trim($groupName) !== ''
                    ? trim($groupName)
                    : null;

                $settings = $field->settings ?? [];
                if ($normalizedGroup === null) {
                    unset($settings['group']);
                } else {
                    $settings['group'] = $normalizedGroup;
                }

                if ($field->type->isLayoutGroup()) {
                    $settings = $this->forceFullWidthForGroup($field->type, $settings);
                }

                $nextSettings = $settings === [] ? null : $settings;

                // ponytail: payload may include unchanged ids; skip to avoid N updates.
                if ($field->settings == $nextSettings) {
                    continue;
                }

                $this->assertValidGroupParent($collection, $settings, $field, $field->type);

                $field->update(['settings' => $nextSettings]);
            }
        });
    }

    /**
     * @param  array<string, mixed>|null  $settings
     */
    public function groupNameFromSettings(?array $settings): ?string
    {
        $group = $settings['group'] ?? null;
        if (! is_string($group)) {
            return null;
        }

        $trimmed = trim($group);

        return $trimmed === '' ? null : $trimmed;
    }

    private function nextPanelSectionIndex(Collection $collection, string $parentName): int
    {
        $count = 0;

        foreach (
            CollectionField::query()
                ->where('collection_id', $collection->id)
                ->get() as $field
        ) {
            if ($this->groupNameFromSettings($field->settings) === $parentName) {
                $count++;
            }
        }

        return $count + 1;
    }

    private function uniqueFieldName(Collection $collection, string $base): string
    {
        $used = CollectionField::query()
            ->where('collection_id', $collection->id)
            ->pluck('name')
            ->all();
        $usedSet = array_fill_keys($used, true);

        if (! isset($usedSet[$base])) {
            return $base;
        }

        $suffix = 2;
        while (isset($usedSet[$base.'_'.$suffix])) {
            $suffix++;
        }

        return $base.'_'.$suffix;
    }

    private function wouldCreateCycle(Collection $collection, CollectionField $field, string $newParentName): bool
    {
        if (! $field->type->isLayoutGroup()) {
            return false;
        }

        $byName = CollectionField::query()
            ->where('collection_id', $collection->id)
            ->get()
            ->keyBy('name');

        $cursor = $newParentName;
        $seen = [$field->name => true];

        while ($cursor !== '') {
            if (isset($seen[$cursor])) {
                return true;
            }

            $seen[$cursor] = true;
            $parent = $byName->get($cursor);
            if ($parent === null) {
                break;
            }

            $cursor = $this->groupNameFromSettings($parent->settings) ?? '';
        }

        return false;
    }
}
