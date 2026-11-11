<?php

namespace App\Http\Resources\Admin;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Str;

/**
 * Serialize a user record with optional role and group payloads.
 *
 * @mixin User
 */
class UserResource extends JsonResource
{
    /**
     * Transform the user into an array for admin listings and forms.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'first_name' => $this->first_name,
            'last_name' => $this->last_name,
            'name' => $this->name,
            'email' => $this->email,
            'username' => $this->username,
            'is_active' => $this->is_active,
            'email_verified_at' => $this->email_verified_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
            'deleted_at' => $this->deleted_at?->toIso8601String(),
            // spatie/laravel-permission types roles() with the configured role model as plain Model.
            'roles' => $this->whenLoaded('roles', fn (): array => $this->roles->map(fn (Model $role): array => [
                'id' => $role->getKey(),
                'name' => $role->getAttribute('name'),
            ])->values()->all()),
            'groups' => $this->whenLoaded('groups', fn () => $this->groups->map(fn ($group) => [
                'id' => $group->id,
                'name' => $group->name,
                'slug' => Str::slug($group->name),
            ])->values()->all()),
        ];
    }
}
