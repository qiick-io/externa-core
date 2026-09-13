<?php

namespace App\Ai\Tools;

use App\Ai\Concerns\ChecksAiPermissions;
use App\Ai\Concerns\LogsAiToolUse;
use App\Enums\PermissionEnum;
use App\Models\User;
use App\Support\Activity\FilterableActivityEvents;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Spatie\Activitylog\Models\Activity;
use Stringable;

/**
 * AI tool that queries application activity logs for the assistant.
 */
class QueryActivityLogs implements Tool
{
    use ChecksAiPermissions;
    use LogsAiToolUse;

    /**
     * Describe what this tool does for the model.
     */
    public function description(): Stringable|string
    {
        return 'Query the application Activity Log (Spatie). Use for suspicious activity, failed/strange logins, audits. '
            .'Auth events use log_name=auth with event=login|logout|failed. Dates must be YYYY-MM-DD only.';
    }

    /**
     * Execute the tool request and return a string result for the model.
     */
    public function handle(Request $request): Stringable|string
    {
        return $this->withAiToolLogging($request, function () use ($request): string {
            if ($error = $this->requirePermission(PermissionEnum::CanShowActivityLogs)) {
                return $error;
            }

            $search = $this->stringArgument($request, 'search');
            $userId = $request->integer('user_id') ?: null;
            $events = $this->normalizeEvents($this->stringArgument($request, 'event'));
            $logName = $this->stringArgument($request, 'log_name');
            $dateFrom = $this->stringArgument($request, 'date_from');
            $dateTo = $this->stringArgument($request, 'date_to');
            $limit = min(max($request->integer('limit', 25), 1), 50);

            if ($dateFrom !== '' && ! $this->isValidDate($dateFrom)) {
                return $this->invalidDateResponse('date_from', $dateFrom);
            }

            if ($dateTo !== '' && ! $this->isValidDate($dateTo)) {
                return $this->invalidDateResponse('date_to', $dateTo);
            }

            $query = Activity::query()
                ->with(['causer'])
                ->latest('id');

            if ($userId !== null) {
                $causer = User::query()->find($userId);

                if ($causer !== null) {
                    $query->causedBy($causer);
                }
            }

            if (count($events) === 1) {
                $query->forEvent($events[0]);
            } elseif (count($events) > 1) {
                $query->whereIn('event', $events);
            }

            if ($logName !== '') {
                $query->inLog($logName);
            }

            if ($dateFrom !== '') {
                $query->whereDate('created_at', '>=', $dateFrom);
            }

            if ($dateTo !== '') {
                $query->whereDate('created_at', '<=', $dateTo);
            }

            if ($search !== '') {
                $term = '%'.$search.'%';
                $query->where(function ($inner) use ($term): void {
                    $inner->where('description', 'like', $term)
                        ->orWhere('subject_type', 'like', $term)
                        ->orWhere('event', 'like', $term);
                });
            }

            $activities = $query->limit($limit)->get()->map(
                fn (Activity $activity): array => $this->serializeActivity($activity),
            )->values()->all();

            return json_encode([
                'count' => count($activities),
                'limit' => $limit,
                'activities' => $activities,
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) ?: '{}';
        });
    }

    /**
     * @return array<string, mixed>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'search' => $schema->string()->description('Search description, subject_type, or event'),
            'event' => $schema->string()->description('Filter by event (single or comma/pipe list): created|updated|deleted|restored|login|logout|failed|ai_prompt|ai_response|ai_tool|ai_mutation'),
            'user_id' => $schema->integer()->description('Filter by causer user id'),
            'log_name' => $schema->string()->description('Filter by log_name (e.g. default, auth, ai). Use auth for login/logout/failed.'),
            'date_from' => $schema->string()->description('Inclusive start date as YYYY-MM-DD only (not relative phrases)'),
            'date_to' => $schema->string()->description('Inclusive end date as YYYY-MM-DD only (not relative phrases)'),
            'limit' => $schema->integer()->description('Maximum rows, default 25 and max 50'),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeActivity(Activity $activity): array
    {
        $causer = $activity->causer;
        $properties = $activity->properties?->toArray() ?? [];
        $snippet = $this->propertiesSnippet($properties);

        return array_filter([
            'id' => $activity->id,
            'description' => $activity->description,
            'event' => $activity->event,
            'log_name' => $activity->log_name,
            'causer' => $causer instanceof User ? [
                'id' => $causer->id,
                'name' => $causer->name,
                'email' => $causer->email,
            ] : null,
            'subject_type' => $activity->subject_type !== null
                ? class_basename($activity->subject_type)
                : null,
            'subject_id' => $activity->subject_id,
            'created_at' => $activity->created_at?->toIso8601String(),
            'properties' => $snippet,
        ], fn (mixed $value): bool => $value !== null);
    }

    /**
     * @param  array<string, mixed>  $properties
     * @return array<string, mixed>|null
     */
    private function propertiesSnippet(array $properties): ?array
    {
        if ($properties === []) {
            return null;
        }

        $snippet = [];

        foreach (['tool', 'action', 'failed', 'ip', 'identifier', 'conversation_id'] as $key) {
            if (array_key_exists($key, $properties) && is_scalar($properties[$key])) {
                $snippet[$key] = $properties[$key];
            }
        }

        if ($snippet !== []) {
            return $snippet;
        }

        // ponytail: keep payload small — only first few scalar keys when no known fields
        foreach ($properties as $key => $value) {
            if (! is_string($key) || ! is_scalar($value)) {
                continue;
            }

            $snippet[$key] = $value;

            if (count($snippet) >= 3) {
                break;
            }
        }

        return $snippet !== [] ? $snippet : null;
    }

    private function stringArgument(Request $request, string $key): string
    {
        $value = $request[$key] ?? null;

        if (! is_scalar($value)) {
            return '';
        }

        return trim((string) $value);
    }

    /**
     * @return list<string>
     */
    private function normalizeEvents(string $event): array
    {
        if ($event === '') {
            return [];
        }

        $parts = preg_split('/[|,]+/', $event) ?: [];
        $events = [];

        foreach ($parts as $part) {
            $normalized = strtolower(str_replace([' ', '-'], '_', trim($part)));

            if ($normalized === '') {
                continue;
            }

            $normalized = match ($normalized) {
                'failed_login', 'login_failed', 'login_failure', 'auth_failed' => 'failed',
                'logged_in', 'user_login' => 'login',
                'logged_out', 'user_logout' => 'logout',
                default => $normalized,
            };

            if (FilterableActivityEvents::isValid($normalized)) {
                $events[] = $normalized;
            }
        }

        return array_values(array_unique($events));
    }

    private function isValidDate(string $value): bool
    {
        if (! preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            return false;
        }

        [$year, $month, $day] = array_map(
            fn (string $part): int => (int) $part,
            explode('-', $value),
        );

        return checkdate($month, $day, $year);
    }

    private function invalidDateResponse(string $field, string $value): string
    {
        return json_encode([
            'error' => "Invalid {$field}: use YYYY-MM-DD only (got \"{$value}\"). Retry without relative phrases like \"last week\".",
            'count' => 0,
            'activities' => [],
        ], JSON_UNESCAPED_UNICODE) ?: '{"error":"Invalid date"}';
    }
}
