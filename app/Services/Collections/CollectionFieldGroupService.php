<?php

namespace App\Services\Collections;

use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use Illuminate\Validation\ValidationException;

/**
 * Nesting helpers for layout group fields (`settings.group` = parent field name).
 *
 * Directus parity: Accordion/Tabs sections are child layout groups (usually group_raw).
 * Leaf fields nest into sections — not as direct accordion/tab headers.
 */
class CollectionFieldGroupService
{
    /**
     * Accordion and Tabs use group children as panels/sections (Directus group-accordion / group-tabs).
     */
    public function isPanelContainer(FieldTypeEnum $type): bool
    {
        return $type === FieldTypeEnum::GroupAccordion
            || $type === FieldTypeEnum::GroupTabs;
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
     * Leaf fields dropped onto Accordion/Tabs are auto-wrapped in a new Raw section
     * (Directus: create section, then nest fields). Layout groups nest as sections as-is.
     *
     * @param  array<int|string, string|null>  $groupsById
     */
    public function applyGroupsFromReorder(Collection $collection, array $groupsById): void
    {
        if ($groupsById === []) {
            return;
        }

        $fields = CollectionField::query()
            ->where('collection_id', $collection->id)
            ->whereIn('id', array_map('intval', array_keys($groupsById)))
            ->get()
            ->keyBy('id');

        $parentsByName = CollectionField::query()
            ->where('collection_id', $collection->id)
            ->get()
            ->keyBy('name');

        foreach ($groupsById as $rawId => $groupName) {
            $id = (int) $rawId;
            $field = $fields->get($id);
            if ($field === null) {
                continue;
            }

            $normalizedGroup = is_string($groupName) && trim($groupName) !== ''
                ? trim($groupName)
                : null;

            // Auto-wrap only when a leaf is newly nested under Accordion/Tabs.
            // Reorders that keep an existing (legacy) leaf→panel link stay as-is
            // until wrapLegacyPanelLeaves() migrates them.
            if (
                $normalizedGroup !== null
                && ! $field->type->isLayoutGroup()
            ) {
                $parent = $parentsByName->get($normalizedGroup);
                $previousGroup = $this->groupNameFromSettings($field->settings);
                if (
                    $parent !== null
                    && $this->isPanelContainer($parent->type)
                    && $previousGroup !== $normalizedGroup
                ) {
                    $section = $this->createPanelSection($collection, $parent);
                    $this->insertFieldBeforeSibling($collection, $section, $field);
                    $parentsByName->put($section->name, $section);
                    $normalizedGroup = $section->name;
                }
            }

            $settings = $field->settings ?? [];
            if ($normalizedGroup === null) {
                unset($settings['group']);
            } else {
                $settings['group'] = $normalizedGroup;
            }

            if ($field->type->isLayoutGroup()) {
                $settings = $this->forceFullWidthForGroup($field->type, $settings);
            }

            $this->assertValidGroupParent($collection, $settings, $field, $field->type);

            $field->update(['settings' => $settings === [] ? null : $settings]);
        }
    }

    /**
     * If a leaf is nested directly under Accordion/Tabs, wrap it in a new Raw section.
     */
    public function wrapLeafUnderPanelIfNeeded(Collection $collection, CollectionField $field): ?CollectionField
    {
        if ($field->type->isLayoutGroup()) {
            return null;
        }

        $parentName = $this->groupNameFromSettings($field->settings);
        if ($parentName === null) {
            return null;
        }

        $parent = CollectionField::query()
            ->where('collection_id', $collection->id)
            ->where('name', $parentName)
            ->first();

        if ($parent === null || ! $this->isPanelContainer($parent->type)) {
            return null;
        }

        $section = $this->createPanelSection($collection, $parent);
        $this->insertFieldBeforeSibling($collection, $section, $field);

        $settings = $field->settings ?? [];
        $settings['group'] = $section->name;
        $field->update(['settings' => $settings]);

        return $section;
    }

    /**
     * Wrap existing leaf children of Accordion/Tabs into Raw sections (one-time repair).
     * All direct leaf children of a panel share one Raw section (Directus: fields inside sections).
     *
     * @return int Number of sections created
     */
    public function wrapLegacyPanelLeaves(Collection $collection): int
    {
        $fields = CollectionField::query()
            ->where('collection_id', $collection->id)
            ->orderBy('sort_order')
            ->get();

        $byName = $fields->keyBy('name');
        /** @var array<string, list<CollectionField>> $leavesByPanel */
        $leavesByPanel = [];

        foreach ($fields as $field) {
            if ($field->type->isLayoutGroup()) {
                continue;
            }

            $parentName = $this->groupNameFromSettings($field->settings);
            if ($parentName === null) {
                continue;
            }

            $parent = $byName->get($parentName);
            if ($parent === null || ! $this->isPanelContainer($parent->type)) {
                continue;
            }

            $leavesByPanel[$parentName][] = $field;
        }

        $created = 0;

        foreach ($leavesByPanel as $parentName => $leaves) {
            $parent = $byName->get($parentName);
            if ($parent === null || $leaves === []) {
                continue;
            }

            $section = $this->createPanelSection($collection, $parent);
            $this->insertFieldBeforeSibling($collection, $section, $leaves[0]);
            $byName->put($section->name, $section);
            $created++;

            foreach ($leaves as $leaf) {
                $settings = $leaf->settings ?? [];
                $settings['group'] = $section->name;
                $leaf->update(['settings' => $settings]);
            }
        }

        return $created;
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

    /**
     * Place a newly created section immediately before the leaf it wraps.
     */
    private function insertFieldBeforeSibling(
        Collection $collection,
        CollectionField $section,
        CollectionField $sibling,
    ): void {
        $sibling->refresh();
        $targetSort = (int) $sibling->sort_order;

        CollectionField::query()
            ->where('collection_id', $collection->id)
            ->where('id', '!=', $section->id)
            ->where('sort_order', '>=', $targetSort)
            ->increment('sort_order');

        $section->update(['sort_order' => $targetSort]);
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
