<?php

namespace App\Ai\Tools;

use App\Ai\Concerns\ChecksAiPermissions;
use App\Ai\Concerns\LogsAiToolUse;
use App\Ai\Support\AiToolJsonDecoder;
use App\Enums\PermissionEnum;
use App\Models\User;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Validation\Rules\Password;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Spatie\Permission\Models\Role;
use Stringable;

/**
 * AI tool for listing and mutating application users (CRUD, restore, force-delete).
 */
class ManageUsers implements Tool
{
    use ChecksAiPermissions;
    use LogsAiToolUse;

    /**
     * Describe what this tool does for the model.
     */
    public function description(): Stringable|string
    {
        return 'List, get, create, update, or soft-delete application users. Creating users requires can-create-users.';
    }

    /**
     * Execute the tool request and return a string result for the model.
     */
    public function handle(Request $request): Stringable|string
    {
        return $this->withAiToolLogging($request, function () use ($request): string {
            $action = (string) $request->string('action');

            return match ($action) {
                'list' => $this->listUsers($request),
                'get' => $this->getUser($request->integer('user_id')),
                'create' => $this->createUser($request),
                'update' => $this->updateUser($request),
                'delete' => $this->deleteUser($request->integer('user_id')),
                'restore' => $this->restoreUser($request->integer('user_id')),
                'force_delete' => $this->forceDeleteUser($request->integer('user_id')),
                default => 'Error: Unknown action. Use list, get, create, update, delete, restore, or force_delete.',
            };
        });
    }

    /**
     * @return array<string, mixed>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'action' => $schema->string()->required()->description('list|get|create|update|delete|restore|force_delete'),
            'user_id' => $schema->integer(),
            'first_name' => $schema->string(),
            'last_name' => $schema->string(),
            'email' => $schema->string(),
            'username' => $schema->string(),
            'password' => $schema->string(),
            'is_active' => $schema->boolean(),
            'role_names_json' => $schema->string()->description('Optional JSON array of role names to sync'),
            'query' => $schema->string(),
            'limit' => $schema->integer(),
        ];
    }

    private function listUsers(Request $request): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanShowUsers)) {
            return $error;
        }

        $limit = min(max($request->integer('limit', 25), 1), 100);
        $query = User::query()->with('roles:id,name')->latest('id');

        if ($request->filled('query')) {
            $term = '%'.trim((string) $request->string('query')).'%';
            $query->where(function ($inner) use ($term): void {
                $inner->where('first_name', 'like', $term)
                    ->orWhere('last_name', 'like', $term)
                    ->orWhere('email', 'like', $term)
                    ->orWhere('username', 'like', $term);
            });
        }

        $users = $query->limit($limit)->get()->map(fn (User $user): array => $this->serializeUser($user));

        return json_encode(['users' => $users], JSON_PRETTY_PRINT) ?: '[]';
    }

    private function getUser(int $userId): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanShowUsers)) {
            return $error;
        }

        $user = User::query()->with('roles:id,name')->find($userId);

        if ($user === null) {
            return 'Error: User not found.';
        }

        return json_encode(['user' => $this->serializeUser($user)], JSON_PRETTY_PRINT) ?: '{}';
    }

    private function createUser(Request $request): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanCreateUsers)) {
            return $error;
        }

        $firstName = trim((string) $request->string('first_name'));
        $email = trim((string) $request->string('email'));
        $password = (string) $request->string('password');

        if ($firstName === '' || $email === '' || $password === '') {
            return 'Error: first_name, email, and password are required.';
        }

        if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return 'Error: Invalid email.';
        }

        if (User::query()->where('email', $email)->exists()) {
            return 'Error: A user with this email already exists.';
        }

        $passwordError = $this->validatePassword($password);

        if ($passwordError !== null) {
            return $passwordError;
        }

        $username = trim((string) $request->string('username'));

        if ($username !== '' && User::query()->where('username', $username)->exists()) {
            return 'Error: A user with this username already exists.';
        }

        $user = User::query()->create([
            'first_name' => $firstName,
            'last_name' => trim((string) $request->string('last_name')) ?: null,
            'email' => $email,
            'username' => $username !== '' ? $username : null,
            'password' => $password,
            'is_active' => $request->has('is_active') ? $request->boolean('is_active') : true,
        ]);

        $roleError = $this->syncRoles($user, $request);

        if ($roleError !== null) {
            $user->delete();

            return $roleError;
        }

        $this->logAiMutation($user, 'create_user');
        $user->load('roles:id,name');

        return json_encode(['ok' => true, 'user' => $this->serializeUser($user)], JSON_PRETTY_PRINT) ?: '{}';
    }

    private function updateUser(Request $request): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanEditUsers)) {
            return $error;
        }

        $user = User::query()->find($request->integer('user_id'));

        if ($user === null) {
            return 'Error: User not found.';
        }

        $attributes = [];

        if ($request->filled('first_name')) {
            $attributes['first_name'] = trim((string) $request->string('first_name'));
        }

        if ($request->has('last_name')) {
            $lastName = trim((string) $request->string('last_name'));
            $attributes['last_name'] = $lastName !== '' ? $lastName : null;
        }

        if ($request->filled('email')) {
            $email = trim((string) $request->string('email'));

            if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
                return 'Error: Invalid email.';
            }

            if (User::query()->where('email', $email)->whereKeyNot($user->id)->exists()) {
                return 'Error: A user with this email already exists.';
            }

            $attributes['email'] = $email;
        }

        if ($request->has('username')) {
            $username = trim((string) $request->string('username'));

            if ($username !== '' && User::query()->where('username', $username)->whereKeyNot($user->id)->exists()) {
                return 'Error: A user with this username already exists.';
            }

            $attributes['username'] = $username !== '' ? $username : null;
        }

        if ($request->filled('password')) {
            $password = (string) $request->string('password');
            $passwordError = $this->validatePassword($password);

            if ($passwordError !== null) {
                return $passwordError;
            }

            $attributes['password'] = $password;
        }

        if ($request->has('is_active')) {
            $attributes['is_active'] = $request->boolean('is_active');
        }

        if ($attributes !== []) {
            $user->update($attributes);
        }

        $roleError = $this->syncRoles($user, $request);

        if ($roleError !== null) {
            return $roleError;
        }

        if ($attributes === [] && ! $request->filled('role_names_json')) {
            return 'Error: Provide fields to update.';
        }

        $this->logAiMutation($user, 'update_user');
        $user->load('roles:id,name');

        return json_encode(['ok' => true, 'user' => $this->serializeUser($user->fresh())], JSON_PRETTY_PRINT) ?: '{}';
    }

    private function deleteUser(int $userId): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanDeleteUsers)) {
            return $error;
        }

        $user = User::query()->find($userId);

        if ($user === null) {
            return 'Error: User not found.';
        }

        if ($this->authenticatedUser()?->is($user)) {
            return 'Error: You cannot delete your own account via AI.';
        }

        $summary = $this->serializeUser($user);
        $this->logAiMutation($user, 'delete_user');
        $user->delete();

        return json_encode(['ok' => true, 'deleted' => $summary], JSON_PRETTY_PRINT) ?: '{}';
    }

    private function restoreUser(int $userId): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanRestoreUsers)) {
            return $error;
        }

        $user = User::query()->onlyTrashed()->find($userId);

        if ($user === null) {
            return 'Error: Trashed user not found.';
        }

        $user->restore();
        $this->logAiMutation($user, 'restore_user');

        return json_encode(['ok' => true, 'user' => $this->serializeUser($user)], JSON_PRETTY_PRINT) ?: '{}';
    }

    private function forceDeleteUser(int $userId): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanForceDeleteUsers)) {
            return $error;
        }

        $user = User::query()->withTrashed()->with('roles:id,name')->find($userId);

        if ($user === null) {
            return 'Error: User not found.';
        }

        if ($this->authenticatedUser()?->is($user)) {
            return 'Error: You cannot force-delete your own account via AI.';
        }

        $summary = $this->serializeUser($user);
        $this->logAiMutation($user, 'force_delete_user');
        $user->forceDelete();

        return json_encode(['ok' => true, 'force_deleted' => $summary], JSON_PRETTY_PRINT) ?: '{}';
    }

    private function validatePassword(string $password): ?string
    {
        $rule = Password::defaults() ?? Password::min(8);

        $validator = validator(
            ['password' => $password],
            ['password' => ['required', 'string', $rule]],
        );

        if ($validator->fails()) {
            return 'Error: '.$validator->errors()->first('password');
        }

        return null;
    }

    private function syncRoles(User $user, Request $request): ?string
    {
        $decoded = AiToolJsonDecoder::optionalArrayFrom($request, 'role_names_json');

        if (is_string($decoded)) {
            return $decoded;
        }

        if ($decoded === null) {
            return null;
        }

        $names = array_values(array_filter(array_map(
            fn ($name): string => is_string($name) ? trim($name) : '',
            $decoded,
        )));

        $roles = Role::query()->whereIn('name', $names)->get();

        if ($roles->count() !== count(array_unique($names))) {
            return 'Error: One or more role names are invalid.';
        }

        $user->syncRoles($roles);

        return null;
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeUser(User $user): array
    {
        return [
            'id' => $user->id,
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'email' => $user->email,
            'username' => $user->username,
            'is_active' => (bool) $user->is_active,
            'roles' => $user->relationLoaded('roles')
                ? $user->roles->pluck('name')->values()->all()
                : [],
        ];
    }
}
