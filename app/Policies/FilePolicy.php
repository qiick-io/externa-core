<?php

declare(strict_types=1);

namespace App\Policies;

use App\Enums\FilePermissionActionEnum;
use App\Enums\PermissionEnum;
use App\Http\Middleware\EnsureCanManageFilesMiddleware;
use App\Models\File;
use App\Models\User;
use App\Services\Api\FileAccessEnforcerService;
use App\Services\Api\FilePermissionGuardService;
use App\Services\Authorization\EffectivePermissionResolverService;
use App\Support\Api\ApiAccess;
use App\Support\Authorization\RequestActorResolver;
use Illuminate\Auth\Access\Response;

/**
 * File abilities for both kinds of actor.
 *
 * API actors (public API, API keys, MCP bearer requests: the request carries an {@see ApiAccess})
 * are judged by {@see FileAccessEnforcerService}: role file ACL, API key `files_scope` /
 * `read_only`, owner ceiling and `read_private`. The request's API actor is judged whoever the
 * gate user is, as the Files API trait did before this policy.
 *
 * Session users keep the Spatie file permissions the admin file manager routes require
 * ({@see EnsureCanManageFilesMiddleware}); super-admins are granted by
 * {@see EffectivePermissionResolverService::hasPermission()}. Session users see private files too.
 */
final class FilePolicy
{
    public function __construct(
        private FileAccessEnforcerService $enforcer,
        private EffectivePermissionResolverService $permissionResolver,
        private RequestActorResolver $actorResolver,
    ) {}

    /**
     * List files. The listing hides private rows separately ({@see FilePermissionGuardService::constrainReadable()}).
     */
    public function viewAny(?User $user): Response
    {
        return $this->decideAction($user, FilePermissionActionEnum::Read, PermissionEnum::CanShowFiles);
    }

    /**
     * Read one file's metadata, content or transforms.
     */
    public function view(?User $user, File $file): Response
    {
        $access = $this->actorResolver->apiAccess();
        if ($access !== null) {
            return $this->apiDecision($this->enforcer->allowsFileRead($access, $file));
        }

        return $this->sessionDecision($user, PermissionEnum::CanShowFiles);
    }

    public function create(?User $user): Response
    {
        return $this->decideAction($user, FilePermissionActionEnum::Create, PermissionEnum::CanCreateFiles);
    }

    /**
     * Class-level: the Files API authorizes before it loads the `{id}` file (403 before 404).
     */
    public function update(?User $user): Response
    {
        return $this->decideAction($user, FilePermissionActionEnum::Update, PermissionEnum::CanEditFiles);
    }

    /**
     * Class-level: the Files API authorizes before it loads the `{id}` file (403 before 404).
     */
    public function delete(?User $user): Response
    {
        return $this->decideAction($user, FilePermissionActionEnum::Delete, PermissionEnum::CanDeleteFiles);
    }

    private function decideAction(
        ?User $user,
        FilePermissionActionEnum $apiAction,
        PermissionEnum $sessionPermission,
    ): Response {
        $access = $this->actorResolver->apiAccess();
        if ($access !== null) {
            return $this->apiDecision($this->enforcer->allowsFileAction($access, $apiAction));
        }

        return $this->sessionDecision($user, $sessionPermission);
    }

    /**
     * Denies with the message the Files API has always answered 403 with.
     */
    private function apiDecision(bool $isAllowed): Response
    {
        return $isAllowed
            ? Response::allow()
            : Response::deny(__('This action is unauthorized for files.'));
    }

    private function sessionDecision(?User $user, PermissionEnum $permission): Response
    {
        return $user !== null && $this->permissionResolver->hasPermission($user, $permission->value)
            ? Response::allow()
            : Response::deny();
    }
}
