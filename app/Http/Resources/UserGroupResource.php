<?php

namespace App\Http\Resources;

use App\Models\UserGroup;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Str;
use Spatie\Permission\Models\Role;

/**
 * Serialize a user group with optional role and membership payloads.
 *
 * @mixin UserGroup
 */
class UserGroupResource extends JsonResource
{
    /**
     * Transform the group into an array for admin listings and forms.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var UserGroup $group */
        $group = $this->resource;

        return [
            'id' => $group->id,
            'name' => $group->name,
            'slug' => Str::slug($group->name),
            'description' => $group->description,
            'users_count' => $group->users_count,
            'roles_count' => $group->roles_count,
            'deleted_at' => $group->deleted_at?->toIso8601String(),
            'roles' => $this->whenLoaded(
                'roles',
                fn () => $group->roles
                    ->map(fn (Role $role): array => [
                        'id' => $role->id,
                        'name' => $role->name,
                    ])
                    ->values()
                    ->all(),
                [],
            ),
            'users' => $this->whenLoaded(
                'users',
                fn () => $group->users
                    ->map(fn ($user): array => [
                        'id' => $user->id,
                        'first_name' => $user->first_name,
                        'last_name' => $user->last_name,
                        'email' => $user->email,
                    ])
                    ->values()
                    ->all(),
                [],
            ),
            'user_ids' => $this->whenLoaded(
                'users',
                fn () => $group->users->pluck('id')->values()->all(),
                [],
            ),
            'role_ids' => $this->whenLoaded(
                'roles',
                fn () => $group->roles->pluck('id')->values()->all(),
                [],
            ),
            'created_at' => $group->created_at?->toIso8601String(),
            'updated_at' => $group->updated_at?->toIso8601String(),
        ];
    }
}
