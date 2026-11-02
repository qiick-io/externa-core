<?php

declare(strict_types=1);

use App\Ai\Agents\AppAssistant;
use App\Ai\Tools\ManageCollections;
use App\Enums\PermissionEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Laravel\Ai\Contracts\HasSkills;
use Laravel\Ai\Skills\Skill;
use Laravel\Ai\Tools\LoadSkill;
use Laravel\Ai\Tools\Request;
use Laravel\Ai\Tools\ToolNameResolver;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

it('implements HasSkills and discovers the three CMS playbooks from resources/skills', function (): void {
    $assistant = new AppAssistant;

    expect($assistant)->toBeInstanceOf(HasSkills::class);

    $sources = [...$assistant->skills()];

    expect($sources)->toBe([resource_path('skills')]);

    $discovered = collect(glob(resource_path('skills').'/*/SKILL.md') ?: [])
        ->map(fn (string $file): ?Skill => Skill::fromDirectory(dirname($file)))
        ->filter()
        ->keyBy('name')
        ->sortKeys();

    expect($discovered->keys()->all())->toBe([
        'approvals',
        'collection-import',
        'collection-operations',
    ]);

    foreach (['approvals', 'collection-import', 'collection-operations'] as $skillName) {
        $skill = $discovered->get($skillName);

        expect($skill)->toBeInstanceOf(Skill::class)
            ->and((string) $skill->description)->not->toBeEmpty()
            ->and((string) $skill->instructions)->not->toBeEmpty();
    }
});

it('loads skill instructions through LoadSkill when AppAssistant skills are merged', function (): void {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);
    $this->actingAs($user);

    $assistant = new AppAssistant($user);
    $tools = LoadSkill::mergeInto([...$assistant->tools()], $assistant);
    $loadSkill = collect($tools)->first(fn ($tool): bool => $tool instanceof LoadSkill);

    expect($loadSkill)->toBeInstanceOf(LoadSkill::class)
        ->and(ToolNameResolver::resolve($loadSkill))->toBe('LoadSkill');

    $loaded = (string) $loadSkill->handle(new Request([
        'name' => 'collection-operations',
    ]));

    expect($loaded)->toContain('collection-operations')
        ->and($loaded)->toContain('ManageCollections')
        ->and($loaded)->toContain('ManageCollectionItems');

    $importLoaded = (string) $loadSkill->handle(new Request([
        'name' => 'collection-import',
    ]));

    expect($importLoaded)->toContain('ImportCollectionCsv')
        ->and($importLoaded)->toContain('ImportRemoteJson');

    $approvalsLoaded = (string) $loadSkill->handle(new Request([
        'name' => 'approvals',
    ]));

    expect($approvalsLoaded)->toContain('RollbackLastAiTurn')
        ->and($approvalsLoaded)->toContain('approval')
        ->and($approvalsLoaded)->toContain('permission');
});

it('keeps the same ACL denials when skills are wired for users without CanUseAi or collection permissions', function (): void {
    $withoutAi = User::factory()->create();
    $this->actingAs($withoutAi);

    $this->get(route('ai.index'))->assertForbidden();

    $aiOnly = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);
    $this->actingAs($aiOnly);

    $this->get(route('ai.index'))->assertOk();

    $assistant = new AppAssistant($aiOnly);
    $domainToolNames = collect($assistant->tools())
        ->map(fn ($tool): string => ToolNameResolver::resolve($tool))
        ->values()
        ->all();

    expect($domainToolNames)->toBeEmpty();

    $merged = LoadSkill::mergeInto([...$assistant->tools()], $assistant);
    $mergedNames = collect($merged)
        ->map(fn ($tool): string => ToolNameResolver::resolve($tool))
        ->values()
        ->all();

    expect($mergedNames)->toBe(['LoadSkill']);

    $deniedCreate = (string) (new ManageCollections)->handle(new Request([
        'action' => 'create',
        'name' => 'Skills Should Not Bypass',
    ]));

    expect($deniedCreate)->toContain('Missing permission');
});
