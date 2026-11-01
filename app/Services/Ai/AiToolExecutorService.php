<?php

declare(strict_types=1);

namespace App\Services\Ai;

use App\Data\Ai\AiToolExecutionResultData;
use App\Models\User;
use Illuminate\Contracts\Auth\Authenticatable;
use Throwable;

/**
 * Resolves the actor, validates arguments, re-checks AuthZ, then runs a registry tool.
 */
class AiToolExecutorService
{
    public function __construct(
        private readonly AiToolRegistryService $registry,
    ) {}

    /**
     * Execute a registered tool for the given actor.
     *
     * @param  array<string, mixed>  $arguments
     * @param  array{include_write?: bool}  $options
     */
    public function execute(
        string $name,
        array $arguments,
        ?Authenticatable $actor = null,
        array $options = [],
    ): AiToolExecutionResultData {
        if (! (bool) config('ai.tools.enabled', true)) {
            return new AiToolExecutionResultData(
                status: 'disabled',
                message: 'AI tools are disabled.',
            );
        }

        $actor ??= $this->resolveActor();
        $definition = $this->registry->get($name);

        if ($definition === null) {
            return new AiToolExecutionResultData(
                status: 'not_found',
                message: sprintf('Unknown tool [%s].', $name),
            );
        }

        $includeWrite = (bool) ($options['include_write'] ?? false);
        $writeEnabled = $includeWrite || (bool) config('ai.tools.write_enabled', false);

        if (! $this->registry->passesConfigGates($definition, $writeEnabled)) {
            return new AiToolExecutionResultData(
                status: 'denied',
                message: sprintf('Tool [%s] is not enabled for this surface.', $name),
            );
        }

        $validationError = $this->validateArguments($definition->inputSchema(), $arguments);

        if ($validationError !== null) {
            return new AiToolExecutionResultData(
                status: 'invalid_args',
                message: $validationError,
            );
        }

        if (! $this->registry->actorPassesAbilities($definition, $actor, $arguments)) {
            return new AiToolExecutionResultData(
                status: 'denied',
                message: sprintf('Not allowed to call tool [%s].', $name),
            );
        }

        try {
            $result = $this->runAsActor($actor, fn (): string => (string) $definition->handle($arguments));
        } catch (Throwable $e) {
            return new AiToolExecutionResultData(
                status: 'denied',
                message: 'Tool execution failed: '.$e->getMessage(),
            );
        }

        return new AiToolExecutionResultData(
            status: 'ok',
            result: $result,
        );
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
