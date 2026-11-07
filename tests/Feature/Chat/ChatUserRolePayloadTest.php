<?php

use App\Enums\RoleEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
});

test('chat messages carry the role of authors, mentioned users, reply authors and pinned authors', function (): void {
    $alice = User::factory()->create(['first_name' => 'Alice', 'last_name' => 'Viewer']);
    $bruno = User::factory()->create(['first_name' => 'Bruno', 'last_name' => 'Sender']);
    $carla = User::factory()->create();

    foreach ([$alice, $bruno, $carla] as $user) {
        $user->assignRole(RoleEnum::SuperAdmin->value);
    }

    $chatId = $this->actingAs($alice)
        ->postJson(route('chat.threads.store'), ['kind' => 'direct', 'user_ids' => [$bruno->id, $carla->id]])
        ->assertSuccessful()
        ->json('chat.id');

    $originalId = $this->actingAs($bruno)
        ->postJson(route('chat.messages.store', $chatId), ['body' => "Hi @[user:{$alice->id}]", 'mentioned_user_ids' => [$alice->id]])
        ->assertSuccessful()
        ->json('message.id');

    $this->actingAs($alice)
        ->postJson(route('chat.messages.store', $chatId), ['body' => 'Reply', 'reply_to_id' => $originalId])
        ->assertSuccessful();
    $this->putJson(route('chat.messages.pin', [$chatId, $originalId]), ['pinned' => true])->assertSuccessful();

    $role = RoleEnum::SuperAdmin->value;
    $response = $this->getJson(route('chat.messages.index', $chatId))->assertSuccessful();

    expect($response->json('messages.0.user'))->toBe(['id' => $bruno->id, 'name' => 'Bruno Sender', 'role' => $role])
        ->and($response->json('messages.0.mentioned_users'))->toBe([['id' => $alice->id, 'name' => 'Alice Viewer', 'role' => $role]])
        ->and($response->json('messages.1.reply_to.user.role'))->toBe($role)
        ->and($response->json('pinned.0.user.role'))->toBe($role);
});
