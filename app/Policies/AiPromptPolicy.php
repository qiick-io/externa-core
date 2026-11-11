<?php

declare(strict_types=1);

namespace App\Policies;

use App\Enums\PermissionEnum;
use App\Models\AiPrompt;
use App\Models\User;
use App\Services\Authorization\EffectivePermissionResolverService;

/**
 * Managing project-level saved AI prompts.
 *
 * Prompts belong to the project, not to their creator: any user with
 * {@see PermissionEnum::CanManageAiPrompts} may create, edit and delete every prompt (super-admins
 * are granted by {@see EffectivePermissionResolverService::hasPermission()}). Listing them for the
 * chat picker only needs the AI route permission.
 */
final class AiPromptPolicy
{
    public function __construct(
        private EffectivePermissionResolverService $permissionResolver,
    ) {}

    public function create(?User $user): bool
    {
        return $this->canManagePrompts($user);
    }

    public function update(?User $user, AiPrompt $prompt): bool
    {
        return $this->canManagePrompts($user);
    }

    public function delete(?User $user, AiPrompt $prompt): bool
    {
        return $this->canManagePrompts($user);
    }

    private function canManagePrompts(?User $user): bool
    {
        return $user !== null
            && $this->permissionResolver->hasPermission($user, PermissionEnum::CanManageAiPrompts->value);
    }
}
