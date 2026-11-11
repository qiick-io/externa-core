<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Enums\RoleEnum;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreApiKeyRequest;
use App\Http\Requests\Concerns\ValidatesListPerPageTrait;
use App\Http\Resources\Admin\ApiKeyResource;
use App\Models\ApiKey;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Admin CRUD for project API keys used by the public CMS API.
 */
class ApiKeyController extends Controller
{
    use ValidatesListPerPageTrait;

    public function index(Request $request): Response
    {
        abort_unless(Gate::allows('viewAny', ApiKey::class), 403);

        $keys = ApiKey::query()
            ->with(['role:id,name', 'owner:id,first_name,last_name,email'])
            ->latest('id')
            ->paginate($this->validatedListPerPage($request))
            ->withQueryString();

        $roles = Role::query()
            ->where('name', '!=', RoleEnum::SuperAdmin->value)
            ->orderBy('name')
            ->get(['id', 'name', 'is_system', 'is_assignable']);

        $owners = User::query()
            ->where('is_active', true)
            ->orderBy('first_name')
            ->orderBy('last_name')
            ->get(['id', 'first_name', 'last_name', 'email']);

        return Inertia::render('admin/api-keys/index', [
            'apiKeys' => ApiKeyResource::collection($keys),
            'roles' => $roles,
            'owners' => $owners->map(fn (User $user): array => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
            ]),
            'currentUserId' => $request->user()?->id,
            'plainTextKey' => $request->session()->pull('plain_text_api_key'),
        ]);
    }

    public function store(StoreApiKeyRequest $request): RedirectResponse
    {
        $data = $request->validated();
        $secret = ApiKey::generateSecret();
        $creatorId = $request->user()?->id;
        $ownerId = isset($data['owner_id']) ? (int) $data['owner_id'] : $creatorId;

        ApiKey::query()->create([
            'name' => $data['name'],
            'key_prefix' => $secret['prefix'],
            'key_hash' => $secret['hash'],
            'role_id' => $data['role_id'],
            'collection_slugs' => $data['collection_slugs'] ?? null,
            'read_only' => (bool) ($data['read_only'] ?? false),
            'files_scope' => $data['files_scope'] ?? 'all',
            'scopes' => $data['scopes'] ?? null,
            'ip_allowlist' => $data['ip_allowlist'] ?? null,
            'rate_limit_per_minute' => $data['rate_limit_per_minute'] ?? null,
            'expires_at' => $data['expires_at'] ?? null,
            'created_by' => $creatorId,
            'owner_id' => $ownerId,
        ]);

        // Flash then redirect so index can pull the one-time secret into props
        $request->session()->flash('plain_text_api_key', $secret['plain']);

        return redirect()
            ->route('api-keys.index')
            ->with('success', __('API key created.'));
    }

    public function destroy(ApiKey $apiKey): RedirectResponse
    {
        abort_unless(Gate::allows('delete', $apiKey), 403);

        $apiKey->forceFill(['revoked_at' => now()])->save();

        return redirect()
            ->route('api-keys.index')
            ->with('success', __('API key revoked.'));
    }
}
