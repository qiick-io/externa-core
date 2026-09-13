<?php

namespace App\Ai\Tools;

use App\Ai\Concerns\ChecksAiPermissions;
use App\Ai\Concerns\LogsAiToolUse;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\CollectionItem;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Models\Conversation;
use Laravel\Ai\Tools\Request;
use Spatie\Activitylog\Models\Activity;
use Stringable;

/**
 * AI tool that rolls back side effects from the previous AI assistant turn.
 */
class RollbackLastAiTurn implements Tool
{
    use ChecksAiPermissions;
    use LogsAiToolUse;

    /**
     * Describe what this tool does for the model.
     */
    public function description(): Stringable|string
    {
        return 'Undo safely created collections/items from the latest AI turn in a conversation by soft-deleting them. Force-deletes cannot be undone.';
    }

    /**
     * Execute the tool request and return a string result for the model.
     */
    public function handle(Request $request): Stringable|string
    {
        return $this->withAiToolLogging($request, function () use ($request): string {
            if ($error = $this->requirePermission(PermissionEnum::CanDeleteCollections)) {
                return $error;
            }

            $user = $this->authenticatedUser();
            $conversationId = trim((string) $request->string('conversation_id'));

            if ($user === null || $conversationId === '') {
                return 'Error: conversation_id is required.';
            }

            $ownsConversation = Conversation::query()
                ->whereKey($conversationId)
                ->where('user_id', $user->id)
                ->exists();

            if (! $ownsConversation) {
                return 'Error: Conversation not found.';
            }

            $lastPrompt = Activity::query()
                ->where('log_name', 'ai')
                ->where('event', 'ai_prompt')
                ->where('causer_type', $user->getMorphClass())
                ->where('causer_id', $user->id)
                ->where('properties->conversation_id', $conversationId)
                ->latest('id')
                ->first();

            if ($lastPrompt === null) {
                return 'Error: No AI turn to roll back.';
            }

            $mutations = Activity::query()
                ->with('subject')
                ->where('log_name', 'ai')
                ->where('event', 'ai_mutation')
                ->where('causer_type', $user->getMorphClass())
                ->where('causer_id', $user->id)
                ->where('properties->conversation_id', $conversationId)
                ->where('id', '>', $lastPrompt->id)
                ->latest('id')
                ->get();

            $deletedItems = 0;
            $deletedCollections = 0;

            foreach ($mutations as $mutation) {
                $action = (string) $mutation->properties->get('action');
                $subject = $mutation->subject;

                if ($subject instanceof CollectionItem && in_array($action, ['create_item', 'import_create_item'], true)) {
                    $subject->delete();
                    $deletedItems++;
                } elseif ($subject instanceof Collection && in_array($action, ['create_collection', 'duplicate_collection'], true)) {
                    $subject->delete();
                    $deletedCollections++;
                }
            }

            return json_encode([
                'ok' => true,
                'conversation_id' => $conversationId,
                'items_soft_deleted' => $deletedItems,
                'collections_soft_deleted' => $deletedCollections,
                'note' => 'Force-deletes cannot be undone.',
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) ?: '{}';
        });
    }

    /**
     * @return array<string, mixed>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'conversation_id' => $schema->string()->required()->description('Owned AI conversation UUID'),
        ];
    }
}
