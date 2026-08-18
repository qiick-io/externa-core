<?php

namespace App\Http\Controllers\Chat;

use App\Enums\PermissionEnum;
use App\Http\Controllers\Controller;
use App\Models\Chat;
use App\Models\Collection;
use App\Models\User;
use App\Services\Authorization\EffectivePermissionResolver;
use App\Services\Chat\ChatService;
use App\Services\Chat\ChatUnreadService;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Inertia hub: /chat and /chat/{uuid}, AI-style split shell.
 */
class ChatPageController extends Controller
{
    public function __construct(
        private ChatService $chats,
        private ChatUnreadService $unread,
        private EffectivePermissionResolver $permissionResolver,
    ) {}

    public function index(Request $request): Response
    {
        return $this->renderPage($request, null);
    }

    public function show(Request $request, Chat $chat): Response
    {
        $this->chats->assertAccessible($request, $chat);

        return $this->renderPage($request, $chat);
    }

    private function renderPage(Request $request, ?Chat $selected): Response
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $tab = $selected instanceof Chat && $selected->isDirect()
            ? 'private'
            : (string) $request->query('tab', 'collection');

        if (! in_array($tab, ['collection', 'private'], true)) {
            $tab = 'collection';
        }

        $q = trim((string) $request->query('q', ''));

        $selectedSummary = null;
        $fields = [];
        if ($selected instanceof Chat) {
            $this->unread->markRead($selected, $user);
            $this->unread->broadcast($user);
            $selected->load([
                'collection:id,name,icon,color',
                'item',
                'participants.user:id,first_name,last_name,email',
                'participants.group:id,name',
            ]);
            if ($selected->isItem() && $selected->collection instanceof Collection) {
                $selected->collection->load(['fields' => fn ($query) => $query->ordered()]);
                $fields = $selected->collection->fields
                    ->map(fn ($field): array => [
                        'id' => $field->id,
                        'name' => $field->name,
                        'type' => $field->type->value,
                        'translatable' => (bool) $field->translatable,
                        'sort_order' => (int) $field->sort_order,
                    ])
                    ->values()
                    ->all();
            }
            $selectedSummary = $this->chats->serializeSummary($selected, $user);
        }

        return Inertia::render('chat/index', [
            'tab' => $tab,
            'q' => $q,
            'selectedChat' => $selectedSummary,
            'fields' => $fields,
            'canCreateDirect' => $this->permissionResolver->hasPermission(
                $user,
                PermissionEnum::CanCreateDirectChats->value,
            ),
        ]);
    }
}
