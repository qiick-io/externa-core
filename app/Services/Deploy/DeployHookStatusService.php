<?php

namespace App\Services\Deploy;

use App\Services\Settings\SettingsRepositoryService;
use Illuminate\Support\Str;

/**
 * Last-run status for deploy hooks (settings-backed, admin visibility only).
 */
class DeployHookStatusService
{
    public const GROUP = 'deploy';

    private const MESSAGE_MAX_LENGTH = 500;

    public function __construct(
        private readonly SettingsRepositoryService $settings,
    ) {}

    /**
     * @param  list<string>  $hookIds
     */
    public function recordSuccess(
        string $hookId,
        string $hookName,
        int $status,
        string $source,
        array $hookIds,
    ): void {
        $this->settings->set(SettingsRepositoryService::SCOPE_PROJECT, self::GROUP, 'last_run', [
            'hook_id' => $hookId,
            'hook_name' => $hookName,
            'outcome' => 'success',
            'status' => $status,
            'message' => null,
            'source' => $source,
            'hook_ids' => $hookIds,
            'at' => $this->now(),
        ]);
    }

    /**
     * @param  list<string>  $hookIds
     */
    public function recordFailure(
        string $hookId,
        string $hookName,
        ?string $message,
        string $source,
        array $hookIds,
        ?int $status = null,
    ): void {
        $this->settings->set(SettingsRepositoryService::SCOPE_PROJECT, self::GROUP, 'last_run', [
            'hook_id' => $hookId,
            'hook_name' => $hookName,
            'outcome' => 'failed',
            'status' => $status,
            'message' => Str::limit($message ?? 'Unknown error', self::MESSAGE_MAX_LENGTH),
            'source' => $source,
            'hook_ids' => $hookIds,
            'at' => $this->now(),
        ]);
    }

    /**
     * @return array{
     *     hook_id: string,
     *     hook_name: string,
     *     outcome: string,
     *     status: int|null,
     *     message: string|null,
     *     source: string,
     *     hook_ids: list<string>,
     *     at: string
     * }|null
     */
    public function lastRun(): ?array
    {
        $stored = $this->settings->get(
            SettingsRepositoryService::SCOPE_PROJECT,
            self::GROUP,
            'last_run',
        );

        if (! is_array($stored) || ! is_string($stored['hook_id'] ?? null)) {
            return null;
        }

        $hookIds = is_array($stored['hook_ids'] ?? null)
            ? array_values(array_filter($stored['hook_ids'], 'is_string'))
            : [];

        return [
            'hook_id' => $stored['hook_id'],
            'hook_name' => is_string($stored['hook_name'] ?? null) ? $stored['hook_name'] : '',
            'outcome' => is_string($stored['outcome'] ?? null) ? $stored['outcome'] : 'failed',
            'status' => is_int($stored['status'] ?? null) ? $stored['status'] : null,
            'message' => is_string($stored['message'] ?? null) ? $stored['message'] : null,
            'source' => is_string($stored['source'] ?? null) ? $stored['source'] : 'manual',
            'hook_ids' => $hookIds,
            'at' => is_string($stored['at'] ?? null) ? $stored['at'] : $this->now(),
        ];
    }

    private function now(): string
    {
        return now()->utc()->format('Y-m-d\TH:i:s\Z');
    }
}
