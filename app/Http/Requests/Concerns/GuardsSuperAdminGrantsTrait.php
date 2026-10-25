<?php

declare(strict_types=1);

namespace App\Http\Requests\Concerns;

use App\Services\Authorization\SuperAdminGuardService;
use Illuminate\Validation\Validator;

/**
 * Rejects super-admin grants in user / group form requests unless the actor is a super-admin.
 *
 * Covers both direct grants (`role_ids` containing super-admin) and indirect ones
 * (`group_ids` pointing at a group that carries the super-admin role).
 */
trait GuardsSuperAdminGrantsTrait
{
    /**
     * Validator "after" hook: add a field error for every super-admin grant the actor may not make.
     */
    protected function rejectSuperAdminGrants(Validator $validator): void
    {
        $superAdminGuard = app(SuperAdminGuardService::class);

        if ($superAdminGuard->canManageSuperAdmins($this->user())) {
            return;
        }

        $message = __('Only a super-admin can grant super-admin access.');

        if ($superAdminGuard->includesSuperAdminRole((array) $this->input('role_ids', []))) {
            $validator->errors()->add('role_ids', $message);
        }

        if ($superAdminGuard->includesSuperAdminGroup((array) $this->input('group_ids', []))) {
            $validator->errors()->add('group_ids', $message);
        }
    }
}
