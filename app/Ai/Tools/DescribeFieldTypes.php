<?php

namespace App\Ai\Tools;

use App\Ai\Concerns\ChecksAiPermissions;
use App\Ai\Concerns\LogsAiToolUse;
use App\Ai\Support\FieldTypeCookbook;
use App\Enums\PermissionEnum;
use App\Models\User;
use App\Services\Authorization\EffectivePermissionResolver;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

/**
 * Returns curated field-type settings guidance for create_field / update_field.
 */
class DescribeFieldTypes implements Tool
{
    use ChecksAiPermissions;
    use LogsAiToolUse;

    public function description(): Stringable|string
    {
        return 'Describe Externa field types with purpose, required settings keys, example settings_json, nested rules, and common pitfalls. Call before create_field/update_field for complex types (blocks, m2a, relations, map, …). Pass types as JSON array, comma list, "all", or "complex".';
    }

    public function handle(Request $request): Stringable|string
    {
        return $this->withAiToolLogging($request, function () use ($request): string {
            if ($error = $this->requireDescribeAccess()) {
                return $error;
            }

            $raw = trim((string) $request->string('types', 'complex'));
            $resolvedKeys = $this->parseTypesInput($raw);

            if ($resolvedKeys === []) {
                return 'Error: No valid field types requested. Use enum values, "all", or "complex".';
            }

            $payload = FieldTypeCookbook::describe($resolvedKeys);

            return json_encode([
                'ok' => true,
                ...$payload,
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) ?: '{}';
        });
    }

    /**
     * @return array<string, mixed>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'types' => $schema->string()->description(
                'JSON array of field type strings, comma-separated list, "all", or "complex" (default complex)'
            ),
        ];
    }

    private function requireDescribeAccess(): ?string
    {
        $user = $this->authenticatedUser();

        if (! $user instanceof User) {
            return 'Error: Unauthenticated.';
        }

        $resolver = app(EffectivePermissionResolver::class);
        $can = $resolver->hasPermission($user, PermissionEnum::CanShowCollections->value)
            || $resolver->hasPermission($user, PermissionEnum::CanCreateCollections->value)
            || $resolver->hasPermission($user, PermissionEnum::CanEditCollections->value);

        if (! $can) {
            return 'Error: Missing permission (can-show-collections|can-create-collections|can-edit-collections). You cannot perform this operation.';
        }

        return null;
    }

    /**
     * @return list<string>
     */
    private function parseTypesInput(string $raw): array
    {
        if ($raw === '' || strtolower($raw) === 'complex') {
            return FieldTypeCookbook::resolveTypeKeys('complex');
        }

        if (strtolower($raw) === 'all') {
            return FieldTypeCookbook::resolveTypeKeys('all');
        }

        if (str_starts_with($raw, '[')) {
            $decoded = json_decode($raw, true);

            if (is_array($decoded)) {
                return FieldTypeCookbook::resolveTypeKeys($decoded);
            }
        }

        return FieldTypeCookbook::resolveTypeKeys($raw);
    }
}
