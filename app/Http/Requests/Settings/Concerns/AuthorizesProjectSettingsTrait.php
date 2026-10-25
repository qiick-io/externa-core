<?php

namespace App\Http\Requests\Settings\Concerns;

use App\Enums\PermissionEnum;
use App\Services\Authorization\EffectivePermissionResolver;

/**
 * Shared authorization for project settings form requests.
 */
trait AuthorizesProjectSettingsTrait
{
    /**
     * Authorize users who can manage project settings.
     */
    public function authorize(): bool
    {
        $user = $this->user();

        return $user !== null
            && app(EffectivePermissionResolver::class)
                ->hasPermission($user, PermissionEnum::CanManageProjectSettings->value);
    }
}
