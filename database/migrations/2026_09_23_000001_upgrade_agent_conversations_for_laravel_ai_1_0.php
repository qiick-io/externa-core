<?php

use App\Models\User;
use Illuminate\Database\Query\Builder;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder as SchemaBuilder;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Ai\Enums\MessageStatus;
use Laravel\Ai\Migrations\AiMigration;

/**
 * Bring pre-1.0 conversation tables (user_id + tool_calls/tool_results) onto the laravel/ai 1.0 schema.
 *
 * ponytail: fresh installs already get the 1.0 shape from the create migration, so every stage is
 * guarded by Schema::hasColumn and this migration is a no-op there.
 */
return new class extends AiMigration
{
    public function up(): void
    {
        if ($this->schema()->hasColumn($this->conversationsTable(), 'user_id')) {
            $this->convertUserIdToParticipant();
        }

        if ($this->schema()->hasColumn($this->messagesTable(), 'tool_calls')) {
            $this->convertToolColumnsToSteps();
        }
    }

    public function down(): void
    {
        if (! $this->schema()->hasColumn($this->messagesTable(), 'tool_calls')) {
            $this->convertStepsToToolColumns();
        }

        if (! $this->schema()->hasColumn($this->conversationsTable(), 'user_id')) {
            $this->convertParticipantToUserId();
        }
    }

    /**
     * Replace user_id with a polymorphic participant (laravel/ai 0.10 upgrade).
     */
    protected function convertUserIdToParticipant(): void
    {
        $conversationsTable = $this->conversationsTable();
        $messagesTable = $this->messagesTable();

        $this->schema()->table($conversationsTable, function (Blueprint $table) {
            $table->dropIndex(['user_id', 'updated_at']);
            $table->dropIndex(['user_id', 'pinned_at']);
            $table->renameColumn('user_id', 'participant_id');
            $table->string('participant_type')->nullable()->after('id');
        });

        $this->schema()->table($messagesTable, function (Blueprint $table) {
            $table->dropIndex('conversation_index');
            $table->dropIndex(['user_id']);
            $table->renameColumn('user_id', 'participant_id');
            $table->string('participant_type')->nullable()->after('conversation_id');
        });

        $participantType = (new User)->getMorphClass();

        $this->query($conversationsTable)->whereNotNull('participant_id')->update(['participant_type' => $participantType]);
        $this->query($messagesTable)->whereNotNull('participant_id')->update(['participant_type' => $participantType]);

        $this->schema()->table($conversationsTable, function (Blueprint $table) {
            $table->index(['participant_type', 'participant_id', 'updated_at'], 'participant_updated_at_index');
            $table->index(['participant_type', 'participant_id', 'pinned_at'], 'participant_pinned_at_index');
        });

        $this->schema()->table($messagesTable, function (Blueprint $table) {
            $table->index(['conversation_id', 'participant_type', 'participant_id', 'updated_at'], 'conversation_index');
            $table->index(['participant_type', 'participant_id', 'agent'], 'participant_index');
        });
    }

    /**
     * Replace tool_calls/tool_results with steps + status (laravel/ai 1.0 upgrade).
     */
    protected function convertToolColumnsToSteps(): void
    {
        $table = $this->messagesTable();

        $this->schema()->table($table, function (Blueprint $blueprint) {
            $blueprint->longText('steps')->nullable();
            $blueprint->string('status', 25)->default(MessageStatus::Completed->value);
        });

        $this->query($table)->where('role', 'user')->update(['steps' => '[]']);

        $this->query($table)
            ->select('conversation_id')
            ->distinct()
            ->orderBy('conversation_id')
            ->chunk(100, function (Collection $conversations) use ($table) {
                foreach ($conversations as $conversation) {
                    $this->backfill($table, $conversation->conversation_id);
                }
            });

        $this->query($table)->whereNull('steps')->update(['steps' => '[]']);

        $dropped = array_values(array_filter(
            ['tool_calls', 'tool_results', 'approval_state'],
            fn (string $column): bool => $this->schema()->hasColumn($table, $column),
        ));

        $this->schema()->table($table, function (Blueprint $blueprint) use ($dropped) {
            $blueprint->longText('steps')->nullable(false)->change();
            $blueprint->dropColumn($dropped);
        });

        if ($this->schema()->hasIndex($table, 'participant_index')) {
            $this->schema()->table($table, fn (Blueprint $blueprint) => $blueprint->dropIndex('participant_index'));
        }

        $this->schema()->table($table, function (Blueprint $blueprint) {
            $blueprint->index(['participant_type', 'participant_id', 'agent'], 'participant_index');
        });
    }

    /**
     * Rewrite one conversation's assistant rows as steps, each result landing on the call that made it.
     */
    protected function backfill(string $table, string $conversationId): void
    {
        $rows = $this->query($table)
            ->where('conversation_id', $conversationId)
            ->where('role', 'assistant')
            ->orderBy('id')
            ->get();

        // A result was recorded on the row of the request that produced it, which may be a later row than its call...
        $results = $rows->flatMap(fn (object $row) => $this->decoded($row->tool_results))->keyBy('id');

        foreach ($rows as $row) {
            $meta = $this->decoded($row->meta);

            $calls = collect($this->decoded($row->tool_calls))
                ->filter(fn (array $call) => $results->has($call['id'] ?? ''))
                ->map(fn (array $call) => [
                    ...$call,
                    'result' => $results[$call['id']]['result'] ?? null,
                    ...array_filter([
                        'denied' => $results[$call['id']]['denied'] ?? false,
                        'failed' => $results[$call['id']]['failed'] ?? false,
                    ]),
                ])
                ->values()
                ->all();

            $content = (string) $row->content;

            $steps = $calls !== [] && $content !== ''
                ? [$this->step('', $calls), $this->step($content, [], $meta['reasoning'] ?? '')]
                : [$this->step($content, $calls, $meta['reasoning'] ?? '')];

            unset($meta['provider_steps'], $meta['provider_content_blocks'], $meta['reasoning']);

            $this->query($table)->where('id', $row->id)->update([
                'steps' => json_encode($steps),
                'meta' => json_encode($meta),
            ]);
        }
    }

    /**
     * Restore tool_calls/tool_results from steps so a pre-1.0 package can read the rows again.
     */
    protected function convertStepsToToolColumns(): void
    {
        $table = $this->messagesTable();

        $this->schema()->table($table, function (Blueprint $blueprint) {
            $blueprint->text('tool_calls')->nullable();
            $blueprint->text('tool_results')->nullable();
        });

        $this->query($table)->orderBy('id')->chunk(200, function (Collection $rows) use ($table) {
            foreach ($rows as $row) {
                $calls = Arr::collapse(array_column($this->decoded($row->steps), 'tool_calls'));

                $this->query($table)->where('id', $row->id)->update([
                    'tool_calls' => json_encode(array_map(fn (array $call) => Arr::except($call, ['result', 'denied', 'failed', 'approval_reason']), $calls)),
                    'tool_results' => json_encode(array_values(array_map(
                        fn (array $call) => Arr::only($call, ['id', 'name', 'arguments', 'result', 'result_id', 'denied', 'failed']),
                        array_filter($calls, fn (array $call) => array_key_exists('result', $call)),
                    ))),
                ]);
            }
        });

        $this->schema()->table($table, function (Blueprint $blueprint) {
            $blueprint->dropIndex('participant_index');
            $blueprint->dropColumn(['steps', 'status']);
            $blueprint->index(['participant_type', 'participant_id'], 'participant_index');
        });
    }

    /**
     * Restore the user_id columns from User-typed participants.
     */
    protected function convertParticipantToUserId(): void
    {
        $conversationsTable = $this->conversationsTable();
        $messagesTable = $this->messagesTable();

        $this->schema()->table($conversationsTable, function (Blueprint $table) {
            $table->dropIndex('participant_updated_at_index');
            $table->dropIndex('participant_pinned_at_index');
            $table->dropColumn('participant_type');
            $table->renameColumn('participant_id', 'user_id');
        });

        $this->schema()->table($messagesTable, function (Blueprint $table) {
            $table->dropIndex('conversation_index');
            $table->dropIndex('participant_index');
            $table->dropColumn('participant_type');
            $table->renameColumn('participant_id', 'user_id');
        });

        $this->schema()->table($conversationsTable, function (Blueprint $table) {
            $table->index(['user_id', 'updated_at']);
            $table->index(['user_id', 'pinned_at']);
        });

        $this->schema()->table($messagesTable, function (Blueprint $table) {
            $table->index(['conversation_id', 'user_id', 'updated_at'], 'conversation_index');
            $table->index(['user_id']);
        });
    }

    /**
     * Build a conversation step from its content, tool calls, and reasoning.
     *
     * @param  list<array<string, mixed>>  $calls
     * @return array<string, mixed>
     */
    protected function step(string $content, array $calls = [], string $reasoning = ''): array
    {
        return [
            'content' => $content,
            'tool_calls' => $calls,
            'reasoning' => $reasoning,
            'replay_blocks' => [],
            'provider_tool_calls' => [],
        ];
    }

    /**
     * Decode a JSON value into an array, returning an empty array for invalid or empty input.
     *
     * @return array<int|string, mixed>
     */
    protected function decoded(?string $json): array
    {
        return is_array($decoded = json_decode($json ?? '', true)) ? $decoded : [];
    }

    protected function query(string $table): Builder
    {
        return DB::connection($this->getConnection())->table($table);
    }

    protected function schema(): SchemaBuilder
    {
        return Schema::connection($this->getConnection());
    }

    protected function conversationsTable(): string
    {
        return config('ai.conversations.tables.conversations', 'agent_conversations');
    }

    protected function messagesTable(): string
    {
        return config('ai.conversations.tables.messages', 'agent_conversation_messages');
    }
};
