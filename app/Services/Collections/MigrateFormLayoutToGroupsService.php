<?php

namespace App\Services\Collections;

use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * One-shot: collections.form_layout → layout group fields + settings.group nesting.
 */
class MigrateFormLayoutToGroupsService
{
    public function __construct(
        private CollectionFormLayoutNormalizer $layoutNormalizer,
        private CollectionFieldGroupService $groupService,
    ) {}

    /**
     * @return array{migrated: int, skipped: int, created_fields: int}
     */
    public function migrateAll(bool $dryRun = false): array
    {
        $migrated = 0;
        $skipped = 0;
        $createdFields = 0;

        $collections = Collection::query()
            ->whereNotNull('form_layout')
            ->orderBy('id')
            ->get();

        foreach ($collections as $collection) {
            $result = $this->migrateCollection($collection, $dryRun);
            if ($result === null) {
                $skipped++;

                continue;
            }

            $migrated++;
            $createdFields += $result;
        }

        return [
            'migrated' => $migrated,
            'skipped' => $skipped,
            'created_fields' => $createdFields,
        ];
    }

    /**
     * @return int|null Created field count, or null when skipped
     */
    public function migrateCollection(Collection $collection, bool $dryRun = false): ?int
    {
        $layout = $this->layoutNormalizer->normalize(
            is_array($collection->form_layout) ? $collection->form_layout : null,
            $collection,
        );

        if ($layout === null) {
            return null;
        }

        $tabs = $layout['tabs'];
        $sections = $layout['sections'];
        if ($tabs === [] && $sections === []) {
            return null;
        }

        if ($dryRun) {
            return $this->estimateCreatedCount($tabs, $sections);
        }

        return DB::transaction(function () use ($collection, $tabs, $sections): int {
            $collection->load(['fields' => fn ($q) => $q->ordered()]);
            $created = 0;
            $sortBase = ((int) $collection->fields->max('sort_order')) + 1;

            $fieldsById = $collection->fields->keyBy('id');
            $usedNames = $collection->fields->pluck('name')->flip()->all();

            $tabGroupName = null;
            if (count($tabs) > 0) {
                $tabGroupName = $this->uniqueName('layout_tabs', $usedNames);
                $this->createGroupField(
                    $collection,
                    $tabGroupName,
                    FieldTypeEnum::GroupTabs,
                    ['en' => 'Tabs'],
                    null,
                    $sortBase++,
                );
                $usedNames[$tabGroupName] = true;
                $created++;
            }

            $tabIdToGroupName = [];
            foreach ($tabs as $tab) {
                $tabId = (string) $tab['id'];
                $name = $this->uniqueName('tab_'.Str::slug($tabId, '_'), $usedNames);
                if ($name === 'tab_') {
                    $name = $this->uniqueName('tab', $usedNames);
                }
                $label = is_array($tab['label'] ?? null) ? $tab['label'] : ['en' => $tabId];
                $this->createGroupField(
                    $collection,
                    $name,
                    FieldTypeEnum::GroupRaw,
                    $label,
                    $tabGroupName,
                    $sortBase++,
                );
                $usedNames[$name] = true;
                $tabIdToGroupName[$tabId] = $name;
                $created++;
            }

            foreach ($sections as $section) {
                $sectionId = (string) ($section['id'] ?? 'section');
                $name = $this->uniqueName('section_'.Str::slug($sectionId, '_'), $usedNames);
                if ($name === 'section_') {
                    $name = $this->uniqueName('section', $usedNames);
                }

                $parentGroup = null;
                $tabId = $section['tab_id'] ?? null;
                if (is_string($tabId) && isset($tabIdToGroupName[$tabId])) {
                    $parentGroup = $tabIdToGroupName[$tabId];
                } elseif ($tabGroupName !== null && count($tabIdToGroupName) === 1) {
                    $parentGroup = reset($tabIdToGroupName) ?: $tabGroupName;
                }

                $collapsible = (bool) ($section['collapsible'] ?? false);
                $type = $collapsible ? FieldTypeEnum::GroupDetail : FieldTypeEnum::GroupRaw;
                $label = is_array($section['label'] ?? null) ? $section['label'] : ['en' => $sectionId];
                $settingsExtra = [];
                if ($type === FieldTypeEnum::GroupDetail) {
                    $settingsExtra['start'] = ($section['collapsed'] ?? false) ? 'closed' : 'open';
                }

                $this->createGroupField(
                    $collection,
                    $name,
                    $type,
                    $label,
                    $parentGroup,
                    $sortBase++,
                    $settingsExtra,
                );
                $usedNames[$name] = true;
                $created++;

                $childSort = 0;
                foreach ($section['field_ids'] ?? [] as $fieldId) {
                    $field = $fieldsById->get((int) $fieldId);
                    if ($field === null || $field->type->isLayoutGroup()) {
                        continue;
                    }

                    $settings = $field->settings ?? [];
                    $settings['group'] = $name;
                    $field->update([
                        'settings' => $settings,
                        'sort_order' => $sortBase + $childSort,
                    ]);
                    $childSort++;
                }
                $sortBase += max($childSort, 1);
            }

            $collection->update(['form_layout' => null]);

            return $created;
        });
    }

    /**
     * @param  list<array<string, mixed>>  $tabs
     * @param  list<array<string, mixed>>  $sections
     */
    private function estimateCreatedCount(array $tabs, array $sections): int
    {
        $count = count($sections);
        if (count($tabs) > 0) {
            $count += 1 + count($tabs);
        }

        return $count;
    }

    /**
     * @param  array<string, true>  $usedNames
     */
    private function uniqueName(string $base, array &$usedNames): string
    {
        $base = preg_replace('/[^a-z0-9_]/', '_', strtolower($base)) ?: 'group';
        $base = preg_replace('/_+/', '_', $base) ?? $base;
        $base = trim($base, '_');
        if ($base === '' || ! preg_match('/^[a-z]/', $base)) {
            $base = 'g_'.$base;
        }

        $candidate = $base;
        $suffix = 2;
        while (isset($usedNames[$candidate])) {
            $candidate = $base.'_'.$suffix;
            $suffix++;
        }

        return $candidate;
    }

    /**
     * @param  array<string, mixed>  $label
     * @param  array<string, mixed>  $extraSettings
     */
    private function createGroupField(
        Collection $collection,
        string $name,
        FieldTypeEnum $type,
        array $label,
        ?string $parentGroup,
        int $sortOrder,
        array $extraSettings = [],
    ): CollectionField {
        $settings = array_merge([
            'display_name' => $label,
            'layout_width' => 'full',
        ], $extraSettings);

        if ($parentGroup !== null) {
            $settings['group'] = $parentGroup;
        }

        $settings = $this->groupService->forceFullWidthForGroup($type, $settings);

        return $collection->fields()->create([
            'name' => $name,
            'type' => $type,
            'translatable' => false,
            'settings' => $settings,
            'sort_order' => $sortOrder,
        ]);
    }
}
