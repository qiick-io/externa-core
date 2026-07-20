<?php

namespace App\Http\Controllers\Admin;

use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreApiKeyRequest;
use App\Http\Requests\Concerns\AuthorizesWithPermission;
use App\Http\Resources\Admin\ApiKeyResource;
use App\Models\ApiKey;
use App\Models\Role;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Admin CRUD for project API keys used by the public CMS API.
 */
class ApiKeyController extends Controller
{
    use AuthorizesWithPermission;

    public function index(Request $request): Response
    {
        $this->authorizePermission(PermissionEnum::CanShowApiKeys->value);

        $keys = ApiKey::query()
            ->with('role:id,name')
            ->latest('id')
            ->paginate($request->integer('per_page', 15))
            ->withQueryString();

        $roles = Role::query()
            ->where('name', '!=', RoleEnum::SuperAdmin->value)
            ->orderBy('name')
            ->get(['id', 'name', 'is_system', 'is_assignable']);

        return Inertia::render('admin/api-keys/index', [
            'apiKeys' => ApiKeyResource::collection($keys),
            'roles' => $roles,
            'plainTextKey' => $request->session()->pull('plain_text_api_key'),
        ]);
    }

    public function store(StoreApiKeyRequest $request): RedirectResponse
    {
        $data = $request->validated();
        $secret = ApiKey::generateSecret();

        ApiKey::query()->create([
            'name' => $data['name'],
            'key_prefix' => $secret['prefix'],
            'key_hash' => $secret['hash'],
            'role_id' => $data['role_id'],
            'ip_allowlist' => $data['ip_allowlist'] ?? null,
            'rate_limit_per_minute' => $data['rate_limit_per_minute'] ?? null,
            'expires_at' => $data['expires_at'] ?? null,
            'created_by' => $request->user()?->id,
        ]);

        // Flash then redirect so index can pull the one-time secret into props
        $request->session()->flash('plain_text_api_key', $secret['plain']);

        return redirect()
            ->route('api-keys.index')
            ->with('success', __('API key created.'));
    }

    public function destroy(ApiKey $apiKey): RedirectResponse
    {
        $this->authorizePermission(PermissionEnum::CanManageApiKeys->value);

        $apiKey->forceFill(['revoked_at' => now()])->save();

        return redirect()
            ->route('api-keys.index')
            ->with('success', __('API key revoked.'));
    }
}
