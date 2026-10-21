<?php

namespace App\Services\Collections;

use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\CollectionItemRevision;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use Spatie\Activitylog\Models\Activity;

/**
 * One-off repair for drafts/revisions left with pre-rename field-name keys.
 *
 * Mapping sources (never similarity):
 * 1. Spatie activity log on CollectionField (attributes.name vs old.name)
 * 2. Explicit --map=collection:old=new
 *
 * Explicit maps win on collision. Ambiguous activity-derived keys are skipped.
 */
class RepairRenamedFieldSnapshotsService
{
    /**
     * @param  list<string>  $mapOptions
     * @return array{
     *     remapped: list<array{collection: string, item_id: int, source: string, old: string, new: string, value: mixed}>,
     *     conflicts: list<array{collection: string, item_id: int, source: string, old: string, new: string}>,
     *     unmappable: list<array{collection: string, item_id: int, source: string, key: string}>,
     *     remapped_count: int,
     *     conflict_count: int,
     *     unmappable_count: int
     * }
     */
    public function run(bool $apply, array $mapOptions = []): array
    {
        $explicit = $this->parseExplicitMaps($mapOptions);
        $activityMaps = $this->mapsFromActivityLog();
        $mapsByCollectionId = $this->mergeMaps($activityMaps, $explicit);

        $remapped = [];
        $conflicts = [];
        $unmappable = [];

        $collections = Collection::withTrashed()
            ->with(['fields' => fn ($q) => $q->orderBy('id')])
            ->get()
            ->keyBy('id');

        foreach ($collections as $collection) {
            /** @var Collection $collection */
            $currentNames = $collection->fields
                ->filter(fn (CollectionField $field) => ! $field->type->isNoData())
                ->pluck('name')
                ->all();
            $currentNameSet = array_fill_keys($currentNames, true);
            $collectionMaps = $mapsByCollectionId[$collection->id] ?? [];

            $items = CollectionItem::withTrashed()
                ->where('collection_id', $collection->id)
                ->orderBy('id')
                ->get();

            foreach ($items as $item) {
                $this->processItem(
                    $collection,
                    $item,
                    $currentNameSet,
                    $collectionMaps,
                    $apply,
                    $remapped,
                    $conflicts,
                    $unmappable,
                );
            }
        }

        return [
            'remapped' => $remapped,
            'conflicts' => $conflicts,
            'unmappable' => $unmappable,
            'remapped_count' => count($remapped),
            'conflict_count' => count($conflicts),
            'unmappable_count' => count($unmappable),
        ];
    }

    /**
     * @param  array<string, true>  $currentNameSet
     * @param  array<string, string>  $collectionMaps
     * @param  list<array{collection: string, item_id: int, source: string, old: string, new: string, value: mixed}>  $remapped
     * @param  list<array{collection: string, item_id: int, source: string, old: string, new: string}>  $conflicts
     * @param  list<array{collection: string, item_id: int, source: string, key: string}>  $unmappable
     */
    private function processItem(
        Collection $collection,
        CollectionItem $item,
        array $currentNameSet,
        array $collectionMaps,
        bool $apply,
        array &$remapped,
        array &$conflicts,
        array &$unmappable,
    ): void {
        $label = (string) ($collection->slug ?: $collection->id);

        $draftPlan = is_array($item->draft_data)
            ? $this->planPayload($item->draft_data, $currentNameSet, $collectionMaps)
            : ['payload' => null, 'remaps' => [], 'conflicts' => [], 'unmappable' => []];

        $revisions = CollectionItemRevision::query()
            ->where('item_id', $item->id)
            ->orderBy('id')
            ->get();

        /** @var list<array{revision: CollectionItemRevision, plan: array{payload: array<string, mixed>, remaps: list<array{old: string, new: string, value: mixed}>, conflicts: list<array{old: string, new: string}>, unmappable: list<string>}}> $revisionPlans */
        $revisionPlans = [];
        foreach ($revisions as $revision) {
            if (! is_array($revision->data)) {
                continue;
            }
            $revisionPlans[] = [
                'revision' => $revision,
                'plan' => $this->planPayload($revision->data, $currentNameSet, $collectionMaps),
            ];
        }

        foreach ($draftPlan['remaps'] as $row) {
            $remapped[] = [
                'collection' => $label,
                'item_id' => (int) $item->id,
                'source' => 'draft_data',
                'old' => $row['old'],
                'new' => $row['new'],
                'value' => $row['value'],
            ];
        }
        foreach ($draftPlan['conflicts'] as $row) {
            $conflicts[] = [
                'collection' => $label,
                'item_id' => (int) $item->id,
                'source' => 'draft_data',
                'old' => $row['old'],
                'new' => $row['new'],
            ];
        }
        foreach ($draftPlan['unmappable'] as $key) {
            $unmappable[] = [
                'collection' => $label,
                'item_id' => (int) $item->id,
                'source' => 'draft_data',
                'key' => $key,
            ];
        }

        foreach ($revisionPlans as $entry) {
            $revision = $entry['revision'];
            $plan = $entry['plan'];
            foreach ($plan['remaps'] as $row) {
                $remapped[] = [
                    'collection' => $label,
                    'item_id' => (int) $item->id,
                    'source' => 'revision:'.$revision->id,
                    'old' => $row['old'],
                    'new' => $row['new'],
                    'value' => $row['value'],
                ];
            }
            foreach ($plan['conflicts'] as $row) {
                $conflicts[] = [
                    'collection' => $label,
                    'item_id' => (int) $item->id,
                    'source' => 'revision:'.$revision->id,
                    'old' => $row['old'],
                    'new' => $row['new'],
                ];
            }
            foreach ($plan['unmappable'] as $key) {
                $unmappable[] = [
                    'collection' => $label,
                    'item_id' => (int) $item->id,
                    'source' => 'revision:'.$revision->id,
                    'key' => $key,
                ];
            }
        }

        $hasWrites = $draftPlan['remaps'] !== []
            || array_reduce($revisionPlans, fn (bool $carry, array $entry): bool => $carry || $entry['plan']['remaps'] !== [], false);

        if (! $apply || ! $hasWrites) {
            return;
        }

        DB::transaction(function () use ($item, $draftPlan, $revisionPlans): void {
            if ($draftPlan['remaps'] !== [] && is_array($draftPlan['payload'])) {
                $item->draft_data = $draftPlan['payload'];
                $item->save();
            }

            foreach ($revisionPlans as $entry) {
                if ($entry['plan']['remaps'] === []) {
                    continue;
                }
                $revision = $entry['revision'];
                $revision->data = $entry['plan']['payload'];
                $revision->save();
            }
        });
    }

    /**
     * @param  array<string, mixed>  $payload
     * @param  array<string, true>  $currentNameSet
     * @param  array<string, string>  $collectionMaps
     * @return array{
     *     payload: array<string, mixed>,
     *     remaps: list<array{old: string, new: string, value: mixed}>,
     *     conflicts: list<array{old: string, new: string}>,
     *     unmappable: list<string>
     * }
     */
    private function planPayload(array $payload, array $currentNameSet, array $collectionMaps): array
    {
        $remaps = [];
        $conflicts = [];
        $unmappable = [];
        $out = $payload;

        foreach (array_keys($payload) as $key) {
            if (! is_string($key) || $key === '') {
                continue;
            }

            if (isset($currentNameSet[$key])) {
                continue;
            }

            $target = $collectionMaps[$key] ?? null;
            if (! is_string($target) || $target === '' || ! isset($currentNameSet[$target])) {
                $unmappable[] = $key;

                continue;
            }

            if (array_key_exists($target, $out)) {
                $conflicts[] = ['old' => $key, 'new' => $target];

                continue;
            }

            $remaps[] = [
                'old' => $key,
                'new' => $target,
                'value' => $out[$key],
            ];
            $out[$target] = $out[$key];
            unset($out[$key]);
        }

        return [
            'payload' => $out,
            'remaps' => $remaps,
            'conflicts' => $conflicts,
            'unmappable' => $unmappable,
        ];
    }

    /**
     * @param  list<string>  $mapOptions
     * @return array<int, array<string, string>>
     */
    private function parseExplicitMaps(array $mapOptions): array
    {
        $out = [];

        foreach ($mapOptions as $raw) {
            if (! is_string($raw) || $raw === '') {
                continue;
            }

            if (preg_match('/^([^:]+):([^=]+)=(.+)$/', $raw, $m) !== 1) {
                throw new InvalidArgumentException(
                    'Invalid --map format "'.$raw.'". Expected collection:old=new (collection id or slug).',
                );
            }

            $collectionKey = trim($m[1]);
            $old = trim($m[2]);
            $new = trim($m[3]);

            if ($collectionKey === '' || $old === '' || $new === '') {
                throw new InvalidArgumentException('Invalid --map "'.$raw.'": empty collection/old/new.');
            }

            if ($old === $new) {
                throw new InvalidArgumentException('Invalid --map "'.$raw.'": old and new must differ.');
            }

            $collection = Collection::withTrashed()
                ->where(function ($q) use ($collectionKey): void {
                    $q->where('slug', $collectionKey);
                    if (ctype_digit($collectionKey)) {
                        $q->orWhere('id', (int) $collectionKey);
                    }
                })
                ->first();

            if ($collection === null) {
                throw new InvalidArgumentException('Unknown collection in --map: '.$collectionKey);
            }

            $hasTarget = $collection->fields()
                ->where('name', $new)
                ->exists();

            if (! $hasTarget) {
                throw new InvalidArgumentException(
                    sprintf('Target field "%s" not found on collection %s.', $new, $collection->slug ?: $collection->id),
                );
            }

            $out[(int) $collection->id][$old] = $new;
        }

        return $out;
    }

    /**
     * @return array{
     *     maps: array<int, array<string, string>>,
     *     ambiguous: array<int, list<string>>
     * }
     */
    private function mapsFromActivityLog(): array
    {
        $fields = CollectionField::query()->get(['id', 'collection_id', 'name']);
        if ($fields->isEmpty()) {
            return ['maps' => [], 'ambiguous' => []];
        }

        $fieldById = $fields->keyBy('id');
        $fieldIds = $fields->pluck('id')->all();

        $activities = Activity::query()
            ->where('subject_type', (new CollectionField)->getMorphClass())
            ->whereIn('subject_id', $fieldIds)
            ->orderBy('id')
            ->get(['subject_id', 'attribute_changes']);

        /** @var array<int, array<string, true>> $historicalByFieldId */
        $historicalByFieldId = [];

        foreach ($activities as $activity) {
            $fieldId = (int) $activity->subject_id;
            $changes = $activity->attribute_changes;
            $props = match (true) {
                $changes instanceof \Illuminate\Support\Collection => $changes->toArray(),
                is_array($changes) => $changes,
                default => [],
            };

            $oldName = data_get($props, 'old.name');
            $newName = data_get($props, 'attributes.name');

            if (! is_string($oldName) || $oldName === '' || ! is_string($newName) || $newName === '') {
                continue;
            }

            if ($oldName === $newName) {
                continue;
            }

            $historicalByFieldId[$fieldId][$oldName] = true;
        }

        /** @var array<int, array<string, list<string>>> $candidatesByCollection */
        $candidatesByCollection = [];

        foreach ($historicalByFieldId as $fieldId => $olds) {
            $field = $fieldById->get($fieldId);
            if ($field === null) {
                continue;
            }

            $current = $field->name;
            foreach (array_keys($olds) as $old) {
                if ($old === $current) {
                    continue;
                }
                $candidatesByCollection[(int) $field->collection_id][$old][] = $current;
            }
        }

        $maps = [];
        $ambiguous = [];

        foreach ($candidatesByCollection as $collectionId => $byOld) {
            foreach ($byOld as $old => $targets) {
                $unique = array_values(array_unique($targets));
                if (count($unique) !== 1) {
                    $ambiguous[$collectionId][] = $old;

                    continue;
                }
                $maps[$collectionId][$old] = $unique[0];
            }
        }

        return ['maps' => $maps, 'ambiguous' => $ambiguous];
    }

    /**
     * @param  array{maps: array<int, array<string, string>>, ambiguous: array<int, list<string>>}  $activity
     * @param  array<int, array<string, string>>  $explicit
     * @return array<int, array<string, string>>
     */
    private function mergeMaps(array $activity, array $explicit): array
    {
        $maps = $activity['maps'];

        foreach ($explicit as $collectionId => $pairs) {
            foreach ($pairs as $old => $new) {
                $maps[$collectionId][$old] = $new;
            }
        }

        return $maps;
    }
}
