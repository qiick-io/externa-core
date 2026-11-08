<?php

use App\Enums\RoleEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

/**
 * Sortable column headers (DataTableColumnHeader) look like the plain ones,
 * as in shadcn's data table: same case, size, weight and colour; only the
 * sort icon tells them apart.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    $admin = User::factory()->create();
    $admin->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($admin);
});

it('renders sortable and plain column headers alike', function (): void {
    $page = visit('/users');
    $page->wait(0.5);

    $headers = $page->script(<<<'JS'
(() => {
    const style = (element) => {
        const computed = getComputedStyle(element);
        return [computed.textTransform, computed.fontSize, computed.fontWeight, computed.color].join(' ');
    };
    const sortable = document.querySelector('main thead [data-test^="column-sort-"]');
    const plain = [...document.querySelectorAll('main thead th')]
        .find((header) => header.textContent.trim() !== '' && !header.querySelector('button, [role="checkbox"]'));
    return { sortable: sortable ? style(sortable) : null, plain: plain ? style(plain) : null };
})()
JS);

    expect($headers['sortable'])->not->toBeNull()
        ->and($headers['plain'])->not->toBeNull()
        ->and($headers['sortable'])->toBe($headers['plain'])
        ->and($headers['sortable'])->toStartWith('none ');

    $page->assertNoJavaScriptErrors();
});
