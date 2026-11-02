<?php

namespace App\Ai\Concerns;

use App\Enums\FilePermissionActionEnum;
use App\Http\Controllers\Api\V1\Concerns\AuthorizesFileAccessTrait;
use App\Models\File;
use App\Services\Api\FilePermissionGuardService;
use App\Support\Api\ApiAccess;
use Illuminate\Database\Eloquent\Builder;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

/**
 * Apply the public Files API ACL ({@see AuthorizesFileAccessTrait}) inside AI / MCP tools.
 *
 * Only API-key actors (MCP bearer requests carrying `apiAccess`) are gated: role file ACL,
 * `read_private`, the key's `files_scope` / `read_only`, and the owner ceiling. Session
 * actors keep the Spatie file permissions the admin file manager uses. Returns English
 * `Error:` strings instead of HTTP aborts.
 */
trait EnforcesAiFileAccessTrait
{
    use AuthorizesFileAccessTrait;

    /**
     * API access of the current MCP bearer request, or null for session actors.
     */
    protected function aiRequestApiAccess(): ?ApiAccess
    {
        $access = request()->attributes->get('apiAccess');

        return $access instanceof ApiAccess ? $access : null;
    }

    protected function guardAiFileAction(FilePermissionActionEnum $action): ?string
    {
        if ($this->aiRequestApiAccess() === null) {
            return null;
        }

        try {
            $this->authorizeFile(request(), $action);
        } catch (HttpExceptionInterface) {
            return 'Error: This action is unauthorized for files.';
        }

        return null;
    }

    /**
     * Read gate for one file (answers "not found" so private files stay invisible).
     */
    protected function guardAiFileReadable(File $file): ?string
    {
        if ($this->aiRequestApiAccess() === null) {
            return null;
        }

        try {
            $this->authorizeFileRead(request(), $file);
        } catch (HttpExceptionInterface) {
            return 'Error: File not found.';
        }

        return null;
    }

    /**
     * Same list gate as `GET /api/v1/files`: key read access, then hide private rows
     * unless the key role holds `read_private`.
     *
     * @param  Builder<File>  $query
     */
    protected function constrainAiReadableFiles(Builder $query): ?string
    {
        $access = $this->aiRequestApiAccess();

        if ($access === null) {
            return null;
        }

        if ($error = $this->guardAiFileAction(FilePermissionActionEnum::Read)) {
            return $error;
        }

        app(FilePermissionGuardService::class)->constrainReadable($query, $access->roleId());

        return null;
    }
}
