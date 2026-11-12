<?php

declare(strict_types=1);

namespace App\Ai\Concerns;

use App\Data\Api\ApiAccessData;
use App\Enums\FilePermissionActionEnum;
use App\Models\File;
use App\Policies\FilePolicy;
use App\Services\Api\FilePermissionGuardService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Gate;
use InvalidArgumentException;

/**
 * Apply the public Files API ACL ({@see FilePolicy}) inside AI / MCP tools.
 *
 * Only API-key actors (MCP bearer requests carrying `apiAccess`) are gated: role file ACL,
 * `read_private`, the key's `files_scope` / `read_only`, and the owner ceiling. Session
 * actors keep the Spatie file permissions the admin file manager uses. Returns English
 * `Error:` strings instead of HTTP aborts.
 */
trait EnforcesAiFileAccessTrait
{
    /**
     * API access of the current MCP bearer request, or null for session actors.
     */
    protected function aiRequestApiAccess(): ?ApiAccessData
    {
        $access = request()->attributes->get('apiAccess');

        return $access instanceof ApiAccessData ? $access : null;
    }

    /**
     * @throws InvalidArgumentException for `read_private`, which is a per-file check ({@see guardAiFileReadable()})
     */
    protected function guardAiFileAction(FilePermissionActionEnum $action): ?string
    {
        if ($this->aiRequestApiAccess() === null) {
            return null;
        }

        $ability = match ($action) {
            FilePermissionActionEnum::Read => 'viewAny',
            FilePermissionActionEnum::Create => 'create',
            FilePermissionActionEnum::Update => 'update',
            FilePermissionActionEnum::Delete => 'delete',
            FilePermissionActionEnum::ReadPrivate => throw new InvalidArgumentException(
                'read_private is checked per file: use guardAiFileReadable().',
            ),
        };

        return Gate::inspect($ability, File::class)->allowed()
            ? null
            : 'Error: This action is unauthorized for files.';
    }

    /**
     * Read gate for one file (answers "not found" so private files stay invisible).
     */
    protected function guardAiFileReadable(File $file): ?string
    {
        if ($this->aiRequestApiAccess() === null) {
            return null;
        }

        return Gate::inspect('view', $file)->allowed() ? null : 'Error: File not found.';
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
