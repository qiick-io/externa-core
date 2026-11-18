<?php

declare(strict_types=1);

use App\Models\ApiKey;
use App\Models\User;
use App\Notifications\ApiKeyExpiringNotification;
use Illuminate\Support\Facades\Notification;

/**
 * `api-keys:notify-expiring` (#781): seven days before a key expires, its owner and its issuer
 * hear about it once, in the bell and by mail.
 */
beforeEach(function (): void {
    Notification::fake();
    $this->freezeSecond();

    $this->owner = User::factory()->create(['is_active' => true]);
    $this->issuer = User::factory()->create(['is_active' => true]);
});

function expiringApiKey(User $owner, ?User $issuer, mixed $expiresAt, array $attributes = []): ApiKey
{
    return ApiKey::factory()->create([
        'owner_id' => $owner->id,
        'created_by' => $issuer?->id,
        'expires_at' => $expiresAt,
        ...$attributes,
    ]);
}

it('notifies the owner and the issuer of a key expiring in seven days, by bell and mail', function (): void {
    $apiKey = expiringApiKey($this->owner, $this->issuer, now()->addDays(7)->addHours(12));

    $this->artisan('api-keys:notify-expiring')->assertSuccessful();

    foreach ([$this->owner, $this->issuer] as $recipient) {
        Notification::assertSentTo(
            $recipient,
            ApiKeyExpiringNotification::class,
            fn (ApiKeyExpiringNotification $notification, array $channels): bool => $notification->apiKey->is($apiKey)
                && in_array('database', $channels, true)
                && in_array('mail', $channels, true),
        );
    }
});

it('notifies an owner who issued the key once', function (): void {
    expiringApiKey($this->owner, $this->owner, now()->addDays(7)->addHour());

    $this->artisan('api-keys:notify-expiring')->assertSuccessful();

    Notification::assertSentToTimes($this->owner, ApiKeyExpiringNotification::class, 1);
});

it('notifies each key on one daily run only', function (): void {
    expiringApiKey($this->owner, null, now()->addDays(7)->addHours(6));

    foreach (range(1, 3) as $day) {
        $this->artisan('api-keys:notify-expiring')->assertSuccessful();
        $this->travel(1)->day();
    }

    Notification::assertSentToTimes($this->owner, ApiKeyExpiringNotification::class, 1);
});

it('skips keys outside the window, revoked keys, keys without expiry and inactive recipients', function (): void {
    expiringApiKey($this->owner, null, now()->addDays(6));
    expiringApiKey($this->owner, null, now()->addDays(9));
    expiringApiKey($this->owner, null, null);
    expiringApiKey($this->owner, null, now()->addDays(7)->addHour(), ['revoked_at' => now()]);
    $inactiveOwner = User::factory()->create(['is_active' => false]);
    expiringApiKey($inactiveOwner, null, now()->addDays(7)->addHour());

    $this->artisan('api-keys:notify-expiring')->assertSuccessful();

    Notification::assertNothingSent();
});

it('names the key by name and public prefix, never by its secret', function (): void {
    $secret = ApiKey::generateSecret();
    $apiKey = ApiKey::factory()->withSecret($secret)->create([
        'name' => 'Website <build>',
        'owner_id' => $this->owner->id,
        'expires_at' => now()->addDays(7)->addHour(),
    ]);
    $notification = new ApiKeyExpiringNotification($apiKey);

    $databasePayload = json_encode($notification->toArray($this->owner));
    $mailHtml = (string) $notification->toMail($this->owner)->render();

    expect($databasePayload)->toContain($apiKey->key_prefix)
        ->not->toContain($secret['plain'])
        ->not->toContain($secret['hash'])
        ->and($mailHtml)->toContain($apiKey->key_prefix)
        ->toContain('Website &lt;build&gt;')
        ->not->toContain('Website <build>')
        ->not->toContain($secret['plain']);
});
