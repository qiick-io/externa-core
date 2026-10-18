<?php

namespace App\Services\Notifiers;

use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\File;
use App\Models\User;
use Illuminate\Support\Facades\Auth;
use Throwable;

/**
 * Enrich minimal webhook event payloads for Slack/Telegram human summaries.
 *
 * Does not mutate outbound webhook bodies — fan-out only.
 */
final class OutboundNotifierContextBuilder
{
    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function enrich(string $type, array $data): array
    {
        $out = $data;
        $out['event_title'] = OutboundNotifierMessageFormatter::titleFor($type);
        $out['occurred_at'] = now()
            ->timezone((string) config('app.timezone', 'UTC'))
            ->format('d M Y, H:i');

        $this->applyActor($out);

        if (isset($data['item_id']) && is_numeric($data['item_id'])) {
            $this->enrichItem($out, (int) $data['item_id']);
        } elseif (isset($data['collection_id']) && is_numeric($data['collection_id'])) {
            $this->enrichCollection($out, (int) $data['collection_id']);
        } elseif (isset($data['file_id']) && is_numeric($data['file_id'])) {
            $this->enrichFile($out, (int) $data['file_id']);
        }

        return $out;
    }

    /**
     * @param  array<string, mixed>  $out
     */
    private function applyActor(array &$out): void
    {
        $user = Auth::user();
        if (! $user instanceof User) {
            return;
        }

        $name = trim((string) $user->name);
        if ($name !== '') {
            $out['actor_name'] = $name;
        }
        if (is_string($user->email) && $user->email !== '') {
            $out['actor_email'] = $user->email;
        }
    }

    /**
     * @param  array<string, mixed>  $out
     */
    private function enrichItem(array &$out, int $itemId): void
    {
        $item = CollectionItem::query()
            ->withTrashed()
            ->with(['collection', 'fieldValues.field', 'userUpdated'])
            ->find($itemId);

        if ($item === null) {
            return;
        }

        $collection = $item->collection;
        if ($collection instanceof Collection) {
            $out['collection_id'] ??= $collection->id;
            $out['collection_slug'] ??= $collection->slug;
            $out['collection_name'] = $collection->name;
            $out['admin_url'] = $this->safeRoute('collections.items.show', [
                'collection' => $collection,
                'item' => $item,
            ]);
        }

        $title = $this->resolveItemTitle($item);
        if ($title !== null) {
            $out['item_title'] = $title;
        }

        $status = trim((string) ($item->approval_status ?? ''));
        if ($status !== '') {
            $out['approval_status'] = $status;
        }

        if (! isset($out['actor_name']) && ! isset($out['actor_email'])) {
            $updater = $item->userUpdated;
            if ($updater instanceof User) {
                $name = trim((string) $updater->name);
                if ($name !== '') {
                    $out['actor_name'] = $name;
                }
                if (is_string($updater->email) && $updater->email !== '') {
                    $out['actor_email'] = $updater->email;
                }
            }
        }
    }

    /**
     * @param  array<string, mixed>  $out
     */
    private function enrichCollection(array &$out, int $collectionId): void
    {
        $collection = Collection::query()->withTrashed()->find($collectionId);
        if ($collection === null) {
            return;
        }

        $out['collection_slug'] ??= $collection->slug;
        $out['collection_name'] = $collection->name;
        $out['admin_url'] = $this->safeRoute('collections.show', [
            'collection' => $collection,
        ]);
    }

    /**
     * @param  array<string, mixed>  $out
     */
    private function enrichFile(array &$out, int $fileId): void
    {
        $file = File::query()->withTrashed()->find($fileId);
        if ($file === null) {
            return;
        }

        $label = trim((string) ($file->title ?: $file->name));
        if ($label !== '') {
            $out['file_name'] = $label;
        }

        $params = [];
        if ($file->parent_id !== null) {
            $params['folder'] = $file->parent_id;
        }
        $out['admin_url'] = $this->safeRoute('files.index', $params);
    }

    private function resolveItemTitle(CollectionItem $item): ?string
    {
        foreach (['title', 'name', 'label'] as $key) {
            $fromDraft = $this->scalarFromMixed($item->draft_data[$key] ?? null);
            if ($fromDraft !== null) {
                return $fromDraft;
            }
        }

        $preferred = [];
        foreach ($item->fieldValues as $row) {
            $name = $row->field?->name;
            if ($name === null || ! in_array($name, ['title', 'name', 'label'], true)) {
                continue;
            }
            $scalar = $this->scalarFromMixed($row->value);
            if ($scalar === null) {
                continue;
            }
            $preferred[$name] ??= $scalar;
        }

        foreach (['title', 'name', 'label'] as $key) {
            if (isset($preferred[$key])) {
                return $preferred[$key];
            }
        }

        return null;
    }

    private function scalarFromMixed(mixed $value): ?string
    {
        if (is_string($value)) {
            $trimmed = trim(strip_tags($value));

            return $trimmed !== '' ? $trimmed : null;
        }

        if (is_int($value) || is_float($value)) {
            return (string) $value;
        }

        if (! is_array($value) || $value === []) {
            return null;
        }

        if (array_is_list($value)) {
            return $this->scalarFromMixed($value[0] ?? null);
        }

        $locale = app()->getLocale();
        if (array_key_exists($locale, $value)) {
            $localized = $this->scalarFromMixed($value[$locale]);
            if ($localized !== null) {
                return $localized;
            }
        }

        foreach ($value as $entry) {
            $scalar = $this->scalarFromMixed($entry);
            if ($scalar !== null) {
                return $scalar;
            }
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $parameters
     */
    private function safeRoute(string $name, array $parameters = []): ?string
    {
        try {
            return route($name, $parameters, absolute: true);
        } catch (Throwable) {
            return null;
        }
    }
}
