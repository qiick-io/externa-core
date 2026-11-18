<?php

declare(strict_types=1);

namespace App\Actions\Collections;

use App\Models\Collection;
use App\Services\Settings\SettingsRepositoryService;

/**
 * Save one user's item list preferences for a collection (visible columns, column
 * alignment, layout and the kanban / calendar grouping fields) in the user settings scope.
 */
final class UpdateCollectionListColumnsAction
{
    /**
     * Preferences written only when the request sends them, so a partial update
     * (a layout switch) never clears the others.
     *
     * @var list<string>
     */
    public const array OPTIONAL_PREFERENCES = ['layout', 'kanban_field', 'calendar_field'];

    public function __construct(
        private SettingsRepositoryService $settingsRepository,
    ) {}

    /**
     * A missing optional key leaves its stored value untouched; a null layout falls back to `table`.
     *
     * @param  array<string, mixed>  $preferences  `columns` and `aligns`, plus any sent OPTIONAL_PREFERENCES
     */
    public function execute(int $userId, Collection $collection, array $preferences): void
    {
        $settingKeyPrefix = 'collection_'.$collection->id;

        $this->storeSetting($userId, $settingKeyPrefix, $preferences['columns'] ?? null);
        $this->storeSetting($userId, $settingKeyPrefix.'_aligns', $preferences['aligns'] ?? null);

        if (array_key_exists('layout', $preferences)) {
            $this->storeSetting($userId, $settingKeyPrefix.'_layout', $preferences['layout'] ?? 'table');
        }

        if (array_key_exists('kanban_field', $preferences)) {
            $this->storeSetting($userId, $settingKeyPrefix.'_kanban_field', $preferences['kanban_field']);
        }

        if (array_key_exists('calendar_field', $preferences)) {
            $this->storeSetting($userId, $settingKeyPrefix.'_calendar_field', $preferences['calendar_field']);
        }
    }

    private function storeSetting(int $userId, string $settingKey, mixed $value): void
    {
        $this->settingsRepository->set(
            SettingsRepositoryService::SCOPE_USER,
            'collection_list',
            $settingKey,
            $value,
            $userId,
        );
    }
}
