<?php

declare(strict_types=1);

namespace App\Services\Ai;

use App\Ai\Support\AiActivityLogger;
use App\Data\Ai\AiToolExecutionResultData;
use App\Data\Api\ApiAccessData;
use App\Enums\ApiKeyScopeEnum;
use App\Enums\PendingToolCallStatusEnum;
use App\Enums\RoleEnum;
use App\Models\ApiKey;
use App\Models\PendingToolCall;
use App\Models\User;
use Illuminate\Contracts\Auth\Authenticatable;
use InvalidArgumentException;
use Throwable;

/**
 * Resolves the actor, validates arguments, applies write/approval policy, then runs a registry tool.
 */
class AiToolExecutorService
{
    public function __construct(
        private readonly AiToolRegistryService $registry,
        private readonly AiToolWriteGateService $writeGate,
        private readonly AiToolApprovalService $approvals,
    ) {}

    /**
     * Execute a registered tool for the given actor.
     *
     * @param  array<string, mixed>  $arguments
     * @param  array{
     *     include_write?: bool,
     *     surface?: string,
     *     pending_id?: string,
     *     skip_approval?: bool,
     *     approved_by?: User|null,
     * }  $options
     */
    public function execute(
        string $name,
        array $arguments,
        ?Authenticatable $actor = null,
        array $options = [],
    ): AiToolExecutionResultData {
        $surface = is_string($options['surface'] ?? null) ? (string) $options['surface'] : 'mcp';
        $actor ??= $this->resolveActor();
        $actorUser = $actor instanceof User ? $actor : null;

        if (! (bool) config('ai.tools.enabled', true)) {
            return $this->finish(
                new AiToolExecutionResultData(
                    status: 'disabled',
                    message: 'AI tools are disabled.',
                ),
                $actorUser,
                $name,
                $arguments,
                decision: 'denied',
                surface: $surface,
            );
        }

        $definition = $this->registry->get($name);

        if ($definition === null) {
            return $this->finish(
                new AiToolExecutionResultData(
                    status: 'not_found',
                    message: sprintf('Unknown tool [%s].', $name),
                ),
                $actorUser,
                $name,
                $arguments,
                decision: 'denied',
                surface: $surface,
            );
        }

        $includeWrite = (bool) ($options['include_write'] ?? false);

        if (! $this->registry->passesConfigGates($definition, $includeWrite ? true : null)) {
            return $this->finish(
                new AiToolExecutionResultData(
                    status: 'denied',
                    message: sprintf('Tool [%s] is not enabled for this surface.', $name),
                ),
                $actorUser,
                $name,
                $arguments,
                decision: 'denied',
                surface: $surface,
            );
        }

        $validationError = $this->validateArguments($definition->inputSchema(), $arguments);

        if ($validationError !== null) {
            return $this->finish(
                new AiToolExecutionResultData(
                    status: 'invalid_args',
                    message: $validationError,
                ),
                $actorUser,
                $name,
                $arguments,
                decision: 'denied',
                surface: $surface,
            );
        }

        if (! $this->registry->actorPassesAbilities($definition, $actor, $arguments)) {
            return $this->finish(
                new AiToolExecutionResultData(
                    status: 'denied',
                    message: sprintf('Not allowed to call tool [%s].', $name),
                ),
                $actorUser,
                $name,
                $arguments,
                decision: 'denied',
                surface: $surface,
            );
        }

        $isMutating = $definition->kind()->isMutating();
        $skipApproval = (bool) ($options['skip_approval'] ?? false);
        $pendingId = is_string($options['pending_id'] ?? null) ? (string) $options['pending_id'] : null;
        $approver = $options['approved_by'] ?? null;
        $approverUser = $approver instanceof User ? $approver : null;

        if ($isMutating && ! $this->writeGate->isToolWriteAllowed($name) && ! $skipApproval) {
            return $this->finish(
                new AiToolExecutionResultData(
                    status: 'denied',
                    message: sprintf('Write tool [%s] is disabled. Enable AI write tools and this tool class first.', $name),
                ),
                $actorUser,
                $name,
                $arguments,
                decision: 'denied',
                surface: $surface,
            );
        }

        if ($isMutating && $surface === 'mcp' && $pendingId === null && ! $skipApproval) {
            $pending = $this->approvals->createPending(
                $name,
                $arguments,
                $surface,
                $actor,
                apiKey: app()->bound(ApiAccessData::class) ? app(ApiAccessData::class)->apiKey : null,
            );

            return $this->finish(
                new AiToolExecutionResultData(
                    status: 'pending_approval',
                    message: 'Tool call awaiting human approval.',
                    pendingId: $pending->uuid,
                ),
                $actorUser,
                $name,
                $arguments,
                decision: 'pending',
                surface: $surface,
                pendingId: $pending->uuid,
            );
        }

        if ($isMutating && $pendingId !== null) {
            $pending = PendingToolCall::query()->where('uuid', $pendingId)->first();

            if ($pending === null) {
                return $this->finish(
                    new AiToolExecutionResultData(
                        status: 'denied',
                        message: 'Unknown pending tool call.',
                    ),
                    $actorUser,
                    $name,
                    $arguments,
                    decision: 'denied',
                    surface: $surface,
                    pendingId: $pendingId,
                );
            }

            if ($pending->tool !== $name) {
                return $this->finish(
                    new AiToolExecutionResultData(
                        status: 'denied',
                        message: 'Pending tool call does not match the requested tool.',
                    ),
                    $actorUser,
                    $name,
                    $arguments,
                    decision: 'denied',
                    surface: $surface,
                    pendingId: $pendingId,
                    approver: $approverUser,
                );
            }

            if (in_array($pending->status, [PendingToolCallStatusEnum::Rejected, PendingToolCallStatusEnum::Expired], true)
                || ($pending->status === PendingToolCallStatusEnum::Pending && $pending->isExpired())) {
                if ($pending->status === PendingToolCallStatusEnum::Pending) {
                    $this->approvals->expireOverdue();
                    $pending->refresh();
                }

                return $this->finish(
                    new AiToolExecutionResultData(
                        status: 'denied',
                        message: sprintf('Pending tool call is %s and will not execute.', $pending->status->value),
                    ),
                    $actorUser,
                    $name,
                    $arguments,
                    decision: $pending->status->value,
                    surface: $surface,
                    pendingId: $pendingId,
                    approver: $approverUser,
                );
            }

            if ($pending->status !== PendingToolCallStatusEnum::Approved && ! $skipApproval) {
                return $this->finish(
                    new AiToolExecutionResultData(
                        status: 'denied',
                        message: 'Pending tool call has not been approved.',
                    ),
                    $actorUser,
                    $name,
                    $arguments,
                    decision: 'denied',
                    surface: $surface,
                    pendingId: $pendingId,
                    approver: $approverUser,
                );
            }

            // Approver must hold the tool's underlying abilities (no self-escalation).
            $permissionActor = $approverUser ?? $actor;

            if (! $this->registry->actorPassesAbilities($definition, $permissionActor, $arguments)) {
                return $this->finish(
                    new AiToolExecutionResultData(
                        status: 'denied',
                        message: sprintf('Approver is not allowed to run tool [%s].', $name),
                    ),
                    $actorUser,
                    $name,
                    $arguments,
                    decision: 'denied',
                    surface: $surface,
                    pendingId: $pendingId,
                    approver: $approverUser,
                );
            }
        }

        try {
            $result = $this->runAsActor($actor, fn (): string => (string) $definition->handle($arguments));
        } catch (Throwable $e) {
            if (isset($pending) && $pending instanceof PendingToolCall) {
                $this->approvals->markFailed($pending, $e->getMessage());
            }

            return $this->finish(
                new AiToolExecutionResultData(
                    status: 'denied',
                    message: 'Tool execution failed: '.$e->getMessage(),
                ),
                $actorUser,
                $name,
                $arguments,
                decision: 'failed',
                surface: $surface,
                pendingId: $pendingId,
                approver: $approverUser,
                result: $e->getMessage(),
            );
        }

        if (isset($pending) && $pending instanceof PendingToolCall) {
            $this->approvals->markExecuted($pending, $result);
        }

        return $this->finish(
            new AiToolExecutionResultData(
                status: 'ok',
                result: $result,
            ),
            $actorUser,
            $name,
            $arguments,
            decision: 'executed',
            surface: $surface,
            pendingId: $pendingId,
            approver: $approverUser,
            result: $result,
        );
    }

    /**
     * Approve a pending MCP tool call and execute it when the approver has permission.
     */
    public function approveAndExecute(PendingToolCall $pending, User $approver): AiToolExecutionResultData
    {
        try {
            $apiAccess = $this->apiAccessForApprovedCall($pending);
            $this->approvals->markApproved($pending, $approver);
        } catch (InvalidArgumentException $e) {
            return $this->finish(
                new AiToolExecutionResultData(
                    status: 'denied',
                    message: $e->getMessage(),
                    pendingId: $pending->uuid,
                ),
                $pending->requester,
                $pending->tool,
                is_array($pending->arguments) ? $pending->arguments : [],
                decision: 'denied',
                surface: $pending->surface,
                pendingId: $pending->uuid,
                approver: $approver,
            );
        }

        $pending->refresh();
        $actor = $pending->requester;

        return $this->withApiAccess($apiAccess, fn (): AiToolExecutionResultData => $this->execute(
            $pending->tool,
            is_array($pending->arguments) ? $pending->arguments : [],
            $actor,
            [
                'surface' => $pending->surface,
                'pending_id' => $pending->uuid,
                'approved_by' => $approver,
                'include_write' => true,
            ],
        ));
    }

    /**
     * The API key access an approved MCP call runs under: the key's role and scopes (collection
     * slugs, read-only, files scope), not the owner's full permissions (#441). Null for calls a
     * session user made. The key is checked again, because it may have been revoked, expired or
     * narrowed while the call waited.
     *
     * @throws InvalidArgumentException when the requesting key can no longer run a write
     */
    private function apiAccessForApprovedCall(PendingToolCall $pending): ?ApiAccessData
    {
        if ($pending->api_key_id === null) {
            return null;
        }

        $apiKey = ApiKey::query()->with(['role', 'owner'])->find($pending->api_key_id);
        $owner = $apiKey?->owner;
        $role = $apiKey?->role;

        $isUsable = $apiKey !== null
            && $apiKey->isActive()
            && $apiKey->hasOwner()
            && $owner instanceof User && $owner->is_active && ! $owner->trashed()
            && $role !== null && $role->name !== RoleEnum::SuperAdmin->value
            && (bool) config('ai.mcp.write_enabled', false)
            && $apiKey->hasScope(ApiKeyScopeEnum::McpWrite)
            && ! $apiKey->read_only;

        if (! $isUsable) {
            throw new InvalidArgumentException('The API key that requested this call can no longer run writes.');
        }

        return new ApiAccessData(actor: 'api_key', role: $role, apiKey: $apiKey);
    }

    /**
     * Binds the API key access where the MCP middleware puts it (the `apiAccess` request attribute,
     * read by the collection and file enforcers, and the container) while the callback runs, then
     * restores what was there before.
     *
     * @template TReturn
     *
     * @param  callable(): TReturn  $callback
     * @return TReturn
     */
    private function withApiAccess(?ApiAccessData $apiAccess, callable $callback): mixed
    {
        if ($apiAccess === null) {
            return $callback();
        }

        $attributes = request()->attributes;
        $hadAttribute = $attributes->has('apiAccess');
        $previousAttribute = $attributes->get('apiAccess');
        $previousBinding = app()->bound(ApiAccessData::class) ? app(ApiAccessData::class) : null;

        $attributes->set('apiAccess', $apiAccess);
        app()->instance(ApiAccessData::class, $apiAccess);

        try {
            return $callback();
        } finally {
            if ($hadAttribute) {
                $attributes->set('apiAccess', $previousAttribute);
            } else {
                $attributes->remove('apiAccess');
            }

            if ($previousBinding instanceof ApiAccessData) {
                app()->instance(ApiAccessData::class, $previousBinding);
            } else {
                app()->forgetInstance(ApiAccessData::class);
            }
        }
    }

    /**
     * @param  array<string, mixed>  $arguments
     */
    private function finish(
        AiToolExecutionResultData $outcome,
        ?User $actor,
        string $tool,
        array $arguments,
        string $decision,
        string $surface,
        ?string $pendingId = null,
        ?User $approver = null,
        ?string $result = null,
    ): AiToolExecutionResultData {
        AiActivityLogger::toolDecision(
            actor: $actor,
            tool: $tool,
            arguments: $arguments,
            decision: $decision,
            status: $outcome->status,
            surface: $surface,
            approver: $approver,
            result: $result ?? $outcome->result ?? $outcome->message,
            pendingId: $pendingId ?? $outcome->pendingId,
        );

        return $outcome;
    }

    private function resolveActor(): ?Authenticatable
    {
        $user = auth()->user();

        return $user instanceof User ? $user : ($user instanceof Authenticatable ? $user : null);
    }

    /**
     * Bind the actor on the guard (and request resolver) while the tool runs.
     *
     * Existing AppAssistant tools authorize via auth()->user() / request()->user();
     * MCP and executor callers may pass a different Authenticatable than the session.
     *
     * @template TReturn
     *
     * @param  callable(): TReturn  $callback
     * @return TReturn
     */
    private function runAsActor(?Authenticatable $actor, callable $callback): mixed
    {
        $guard = auth()->guard();
        $previous = $guard->user();
        $request = request();
        $previousResolver = $request->getUserResolver();

        if ($actor instanceof Authenticatable) {
            $guard->setUser($actor);
            $request->setUserResolver(static fn () => $actor);
        }

        try {
            return $callback();
        } finally {
            if ($previous instanceof Authenticatable) {
                $guard->setUser($previous);
            } else {
                $guard->forgetUser();
            }

            $request->setUserResolver($previousResolver);
        }
    }

    /**
     * Lightweight JSON Schema check (required keys + basic types). Full draft validation is out of scope.
     *
     * @param  array<string, mixed>  $schema
     * @param  array<string, mixed>  $arguments
     */
    private function validateArguments(array $schema, array $arguments): ?string
    {
        $required = $schema['required'] ?? [];

        if (! is_array($required)) {
            $required = [];
        }

        foreach ($required as $key) {
            if (! is_string($key)) {
                continue;
            }

            if (! array_key_exists($key, $arguments) || $arguments[$key] === null) {
                return sprintf('Missing required argument [%s].', $key);
            }
        }

        $properties = $schema['properties'] ?? [];

        if (is_object($properties)) {
            $properties = (array) $properties;
        }

        if (! is_array($properties)) {
            return null;
        }

        foreach ($arguments as $key => $value) {
            if (! is_string($key) || ! array_key_exists($key, $properties)) {
                continue;
            }

            $property = $properties[$key];

            if (is_object($property)) {
                $property = (array) $property;
            }

            if (! is_array($property)) {
                continue;
            }

            $type = $property['type'] ?? null;

            if (! is_string($type) || $value === null) {
                continue;
            }

            $ok = match ($type) {
                'string' => is_string($value),
                'integer' => is_int($value) || (is_string($value) && ctype_digit(ltrim($value, '-'))),
                'number' => is_int($value) || is_float($value) || (is_string($value) && is_numeric($value)),
                'boolean' => is_bool($value),
                'array' => is_array($value),
                'object' => is_array($value) || is_object($value),
                default => true,
            };

            if (! $ok) {
                return sprintf('Argument [%s] must be of type %s.', $key, $type);
            }
        }

        return null;
    }
}
