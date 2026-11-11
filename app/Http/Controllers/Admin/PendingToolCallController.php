<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Enums\PendingToolCallStatusEnum;
use App\Enums\PermissionEnum;
use App\Http\Controllers\Controller;
use App\Http\Requests\Concerns\AuthorizesWithPermissionTrait;
use App\Models\PendingToolCall;
use App\Models\User;
use App\Services\Ai\AiToolApprovalService;
use App\Services\Ai\AiToolExecutorService;
use App\Services\Ai\AiToolRegistryService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use InvalidArgumentException;
use Throwable;

/**
 * Admin inbox for MCP AI tool calls awaiting human approval.
 */
class PendingToolCallController extends Controller
{
    use AuthorizesWithPermissionTrait;

    public function __construct(
        private readonly AiToolApprovalService $approvals,
        private readonly AiToolExecutorService $executor,
        private readonly AiToolRegistryService $registry,
    ) {}

    public function index(Request $request): Response
    {
        $this->authorizePermission(PermissionEnum::CanUseAi->value);

        $this->approvals->expireOverdue();

        $pending = PendingToolCall::query()
            ->with(['requester:id,first_name,last_name,email'])
            ->where('status', PendingToolCallStatusEnum::Pending)
            ->where('expires_at', '>', now())
            ->orderBy('expires_at')
            ->limit(100)
            ->get()
            ->map(fn (PendingToolCall $row): array => [
                'id' => $row->id,
                'uuid' => $row->uuid,
                'tool' => $row->tool,
                'surface' => $row->surface,
                'arguments' => $this->approvals->redactedArguments($row),
                'expires_at' => $row->expires_at?->toIso8601String(),
                'created_at' => $row->created_at?->toIso8601String(),
                'requester' => $row->requester === null ? null : [
                    'id' => $row->requester->id,
                    'name' => trim($row->requester->first_name.' '.$row->requester->last_name),
                    'email' => $row->requester->email,
                ],
            ]);

        return Inertia::render('admin/pending-tool-calls/index', [
            'pending' => $pending,
        ]);
    }

    public function approve(Request $request, PendingToolCall $pendingToolCall): RedirectResponse
    {
        $this->authorizePermission(PermissionEnum::CanUseAi->value);

        $user = $request->user();

        if (! $user instanceof User) {
            abort(403);
        }

        $definition = $this->registry->get($pendingToolCall->tool);

        if ($definition === null || ! $this->registry->actorPassesAbilities(
            $definition,
            $user,
            is_array($pendingToolCall->arguments) ? $pendingToolCall->arguments : [],
        )) {
            return redirect()->back()->with('error', __('You do not have permission to approve this tool call.'));
        }

        try {
            $outcome = $this->executor->approveAndExecute($pendingToolCall, $user);
        } catch (Throwable $e) {
            return redirect()->back()->with('error', __('Could not approve tool call: :message', [
                'message' => $e->getMessage(),
            ]));
        }

        if (! $outcome->isOk()) {
            return redirect()->back()->with('error', $outcome->message ?? __('Tool call was not executed.'));
        }

        return redirect()->back()->with('success', __('Tool call approved and executed.'));
    }

    public function reject(Request $request, PendingToolCall $pendingToolCall): RedirectResponse
    {
        $this->authorizePermission(PermissionEnum::CanUseAi->value);

        $user = $request->user();

        if (! $user instanceof User) {
            abort(403);
        }

        // Rejecting needs the same tool ability as approving; the requester may always withdraw
        // their own call (#441).
        $definition = $this->registry->get($pendingToolCall->tool);
        $isRequester = $pendingToolCall->requested_by !== null && $pendingToolCall->requested_by === $user->id;
        $canDecide = $definition !== null && $this->registry->actorPassesAbilities(
            $definition,
            $user,
            is_array($pendingToolCall->arguments) ? $pendingToolCall->arguments : [],
        );

        if (! $isRequester && ! $canDecide) {
            return redirect()->back()->with('error', __('You do not have permission to reject this tool call.'));
        }

        try {
            $this->approvals->reject($pendingToolCall, $user);
        } catch (InvalidArgumentException $e) {
            return redirect()->back()->with('error', $e->getMessage());
        }

        return redirect()->back()->with('success', __('Tool call rejected.'));
    }
}
