<?php

namespace App\Http\Resources\Admin;

use App\Models\Role;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Str;

/**
 * Serialize a role record with optional permission payloads.
 *
 * @mixin Role
 */
class RoleResource extends JsonResource
{
    /**
     * Transform the role into an array for admin listings and forms.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'label' => Str::of($this->name)->replace(['-', '_'], ' ')->headline()->toString(),
            'guard_name' => $this->guard_name,
            'is_system' => (bool) $this->is_system,
            'is_assignable' => (bool) $this->is_assignable,
            'permissions_count' => $this->when(
                $this->relationLoaded('permissions'),
                fn () => $this->permissions->count(),
                $this->permissions_count ?? null,
            ),
            'permissions' => $this->whenLoaded('permissions', fn () => $this->permissions->map(fn ($permission) => [
                'id' => $permission->id,
                'name' => $permission->name,
            ])->values()->all()),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
