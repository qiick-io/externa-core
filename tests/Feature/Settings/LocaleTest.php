<?php

use App\Models\User;
use Illuminate\Support\Facades\App;

test('middleware sets locale from authenticated user', function () {
    $user = User::factory()->create(['locale' => 'it']);

    $this->actingAs($user)
        ->get(route('profile.edit'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->where('locale', 'it')
            ->has('availableLocales.en')
            ->has('availableLocales.it')
            ->has('availableLocales.de')
        );

    expect(App::getLocale())->toBe('it');
});

test('middleware sets locale from cookie when guest', function () {
    $this->withUnencryptedCookie('locale', 'de')
        ->get(route('login'))
        ->assertOk();

    expect(App::getLocale())->toBe('de');
});

test('middleware prefers user locale over cookie', function () {
    $user = User::factory()->create(['locale' => 'it']);

    $this->actingAs($user)
        ->withUnencryptedCookie('locale', 'de')
        ->get(route('profile.edit'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page->where('locale', 'it'));

    expect(App::getLocale())->toBe('it');
});

test('locale endpoint rejects invalid locale', function () {
    $user = User::factory()->create(['locale' => 'en']);

    $this->actingAs($user)
        ->from(route('profile.edit'))
        ->patch(route('locale.update'), ['locale' => 'xx'])
        ->assertSessionHasErrors('locale');

    expect($user->refresh()->locale)->toBe('en');
});

test('locale endpoint persists valid locale and sets cookie', function (string $locale) {
    $user = User::factory()->create(['locale' => 'en']);

    $response = $this->actingAs($user)
        ->from(route('profile.edit'))
        ->patch(route('locale.update'), ['locale' => $locale]);

    $response
        ->assertSessionHasNoErrors()
        ->assertRedirect(route('profile.edit'))
        ->assertPlainCookie('locale', $locale);

    expect($user->refresh()->locale)->toBe($locale);
})->with(['en', 'it', 'de']);

test('validation messages follow active locale', function () {
    $user = User::factory()->create(['locale' => 'it']);

    $this->actingAs($user)
        ->from(route('profile.edit'))
        ->patch(route('profile.update'), [
            'first_name' => '',
            'last_name' => 'User',
            'email' => 'not-an-email',
        ])
        ->assertSessionHasErrors(['first_name', 'email']);

    $errors = session('errors');
    expect($errors)->not->toBeNull();
    expect($errors->first('first_name'))->toContain('richiesto');
});
