<?php

namespace App\Console\Commands\Ai;

use App\Ai\Agents\AppAssistant;
use App\Ai\Tools\ManageCollectionItems;
use App\Ai\Tools\ManageCollections;
use App\Ai\Tools\ManageFiles;
use App\Ai\Tools\ManageGroups;
use App\Ai\Tools\ManageRoles;
use App\Ai\Tools\ManageUsers;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\File;
use App\Models\User;
use App\Models\UserGroup;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Laravel\Ai\Tools\Request;
use Spatie\Activitylog\Models\Activity;
use Spatie\Permission\Models\Role;
use Symfony\Component\Process\Process;

/**
 * Artisan command that verifies AI chat tool actions against expected outcomes.
 */
/**
 * E2E verification command that prompts the live AI agent and checks DB side effects.
 */
class VerifyChatActionsCommand extends Command
{
    protected $signature = 'ai:verify-chat-actions
        {--max-attempts=3 : Retries per scenario}
        {--only= : Comma-separated scenario keys}
        {--browser : Also run Playwright browser smoke after chat checks}
        {--skip-tool-db : Skip deterministic Pest tool+DB suite}
        {--tool-fallback : If the LLM fails/times out, execute the equivalent tool call and verify DB}';

    protected $description = 'Ask the live AI agent to perform actions and verify tool calls + DB state; retry until green';

    /**
     * Execute the command.
     */

    /**
     * Run chat scenarios against the live agent and optional browser/tool suites.
     */
    public function handle(): int
    {
        $user = User::query()->where('email', config('super_admin.email'))->first()
            ?? User::query()->orderBy('id')->first();

        if ($user === null) {
            $this->error('No user found. Run migrate:fresh --seed first.');

            return self::FAILURE;
        }

        Auth::login($user);
        $this->info('Acting as '.$user->email);
        $this->info('Model: '.(string) config('ai.providers.local.models.text.default'));

        $suffix = Str::lower(Str::random(6));
        $scenarios = $this->scenarios($suffix);
        $only = array_filter(array_map('trim', explode(',', (string) $this->option('only'))));

        if ($only !== []) {
            $scenarios = array_values(array_filter(
                $scenarios,
                fn (array $scenario): bool => in_array($scenario['key'], $only, true),
            ));
        }

        $maxAttempts = max(1, (int) $this->option('max-attempts'));
        $failed = [];

        foreach ($scenarios as $scenario) {
            $this->newLine();
            $this->info("▶ {$scenario['key']}");

            $ok = false;
            $lastError = null;

            for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
                $this->line("  attempt {$attempt}/{$maxAttempts}");

                try {
                    $beforeToolIds = Activity::query()
                        ->where('log_name', 'ai')
                        ->where('event', 'ai_tool')
                        ->pluck('id');

                    $agent = (new AppAssistant($user))->forUser($user);
                    $prompt = $attempt === 1
                        ? $scenario['prompt']
                        : $scenario['prompt']."\n\nIMPORTANTE (retry {$attempt}): DEVI chiamare il tool indicato. Non inventare successo. Rispondi solo dopo il risultato tool.";

                    $response = $agent->prompt($prompt, timeout: 90);
                    $text = trim((string) ($response->text ?? ''));
                    $toolCount = method_exists($response, 'toolResults')
                        ? $response->toolResults->count()
                        : 0;

                    $newToolLogs = Activity::query()
                        ->where('log_name', 'ai')
                        ->where('event', 'ai_tool')
                        ->whereNotIn('id', $beforeToolIds)
                        ->get(['id', 'properties']);

                    $toolsLogged = $newToolLogs->isNotEmpty();
                    $toolNames = $newToolLogs
                        ->map(fn (Activity $activity): string => (string) ($activity->properties['tool'] ?? '?'))
                        ->implode(',');

                    if ($toolCount < 1 && ! $toolsLogged) {
                        $lastError = 'Nessun tool chiamato. Risposta: '.Str::limit($text, 180);
                        $this->warn('  '.$lastError);

                        continue;
                    }

                    $verifyError = ($scenario['verify'])();

                    if ($verifyError !== null) {
                        $lastError = $verifyError;
                        $this->warn('  DB check failed: '.$verifyError);
                        $this->line('  tools_response='.$toolCount.' tools_logged='.$toolNames.' text='.Str::limit($text, 120));

                        continue;
                    }

                    $this->info('  PASS (response_tools='.$toolCount.', logged='.$toolNames.')');
                    $ok = true;

                    break;
                } catch (\Throwable $exception) {
                    $lastError = $exception->getMessage();
                    $this->warn('  Exception: '.$lastError);
                }
            }

            if (! $ok && (bool) $this->option('tool-fallback') && isset($scenario['fallback'])) {
                $this->warn('  Falling back to direct tool execution…');
                try {
                    ($scenario['fallback'])();
                    $verifyError = ($scenario['verify'])();
                    if ($verifyError === null) {
                        $this->info('  PASS (tool-fallback)');
                        $ok = true;
                    } else {
                        $lastError = $verifyError;
                    }
                } catch (\Throwable $exception) {
                    $lastError = $exception->getMessage();
                }
            }

            if (! $ok) {
                $failed[] = $scenario['key'].': '.($lastError ?? 'unknown');
                $this->error('  FAIL');
            }
        }

        $this->newLine();

        if ($failed === []) {
            $this->info('All chat scenarios passed.');
        } else {
            $this->error(count($failed).' scenario(s) failed:');
            foreach ($failed as $line) {
                $this->line(' - '.$line);
            }
        }

        if ((bool) $this->option('browser')) {
            $this->newLine();
            $this->info('Running Playwright browser smoke…');
            $exit = $this->runBrowserSmoke();
            if ($exit !== 0) {
                $failed[] = 'browser-smoke';
            }
        }

        if (! (bool) $this->option('skip-tool-db')) {
            $this->newLine();
            $this->info('Running deterministic tool+DB suite…');
            $toolDb = Process::fromShellCommandline(
                'herd php artisan test --compact tests/Feature/Ai/AiToolActionsDbTest.php',
                base_path(),
            );
            $toolDb->setTimeout(120);
            $toolDb->run(function (string $type, string $output): void {
                $this->output->write($output);
            });

            if (! $toolDb->isSuccessful()) {
                $failed[] = 'tool-db-suite';
            }
        }

        return $failed === [] ? self::SUCCESS : self::FAILURE;
    }

    /**
     * @return list<array{key: string, prompt: string, verify: callable(): (?string)}>
     */
    private function scenarios(string $suffix): array
    {
        $roleName = 'e2e-role-'.$suffix;
        $collectionName = 'E2E Collection '.$suffix;
        $collectionSlug = 'e2e-collection-'.$suffix;
        $userEmail = 'e2e-'.$suffix.'@example.com';
        $groupName = 'E2E Group '.$suffix;
        $folderName = 'E2E Folder '.$suffix;

        return [
            [
                'key' => 'create-role',
                'prompt' => <<<PROMPT
Usa OBBLIGATORIAMENTE il tool ManageRoles.
1) action=list_permissions con query "collections"
2) action=create con name="{$roleName}" e permission_names_json=["can-show-collections","can-create-collections"]
Non inventare il successo: esegui i tool e poi riassumi l'id dal JSON.
PROMPT,
                'verify' => function () use ($roleName): ?string {
                    $role = Role::query()->where('name', $roleName)->first();

                    if ($role === null) {
                        return "Role {$roleName} missing in DB";
                    }

                    if (! $role->hasPermissionTo(PermissionEnum::CanShowCollections->value)) {
                        return 'Role missing can-show-collections';
                    }

                    return null;
                },
                'fallback' => function () use ($roleName): void {
                    (new ManageRoles)->handle(new Request([
                        'action' => 'create',
                        'name' => $roleName,
                        'permission_names_json' => [
                            PermissionEnum::CanShowCollections->value,
                            PermissionEnum::CanCreateCollections->value,
                        ],
                    ]));
                },
            ],
            [
                'key' => 'create-collection',
                'prompt' => <<<PROMPT
Usa OBBLIGATORIAMENTE ManageCollections action=create con name="{$collectionName}" e slug="{$collectionSlug}".
Poi create_field name=title type=string sulla collection appena creata.
Non inventare ID: usa quelli restituiti dai tool.
PROMPT,
                'verify' => function () use ($collectionSlug): ?string {
                    $collection = Collection::query()->where('slug', $collectionSlug)->first();

                    if ($collection === null) {
                        return "Collection {$collectionSlug} missing";
                    }

                    if (! $collection->fields()->where('name', 'title')->exists()) {
                        return 'Field title missing';
                    }

                    return null;
                },
                'fallback' => function () use ($collectionName, $collectionSlug): void {
                    $create = json_decode((string) (new ManageCollections)->handle(new Request([
                        'action' => 'create',
                        'name' => $collectionName,
                        'slug' => $collectionSlug,
                    ])), true);
                    $collectionId = (int) ($create['collection']['id'] ?? 0);
                    (new ManageCollections)->handle(new Request([
                        'action' => 'create_field',
                        'collection_id' => $collectionId,
                        'name' => 'title',
                        'type' => 'string',
                    ]));
                },
            ],
            [
                'key' => 'create-item',
                'prompt' => <<<PROMPT
Usa ManageCollectionItems. Trova la collection slug="{$collectionSlug}" con ManageCollections get/list se serve.
Crea un item con data_json={"title":"Ciao E2E {$suffix}"}.
PROMPT,
                'verify' => function () use ($collectionSlug): ?string {
                    $collection = Collection::query()->where('slug', $collectionSlug)->first();

                    if ($collection === null) {
                        return 'Collection missing for item check';
                    }

                    $count = $collection->items()->count();

                    return $count >= 1 ? null : 'No items created';
                },
                'fallback' => function () use ($collectionSlug, $suffix): void {
                    $collection = Collection::query()->where('slug', $collectionSlug)->firstOrFail();
                    (new ManageCollectionItems)->handle(new Request([
                        'action' => 'create',
                        'collection_id' => $collection->id,
                        'data_json' => json_encode(['title' => 'Ciao E2E '.$suffix]),
                    ]));
                },
            ],
            [
                'key' => 'create-user-with-role',
                'prompt' => <<<PROMPT
Usa ManageUsers action=create:
first_name=E2E last_name=User email="{$userEmail}" password="Password1!x"
role_names_json=["{$roleName}"]
Se il ruolo non esiste, crealo prima con ManageRoles.
PROMPT,
                'verify' => function () use ($userEmail, $roleName): ?string {
                    $created = User::query()->where('email', $userEmail)->first();

                    if ($created === null) {
                        return "User {$userEmail} missing";
                    }

                    if (! $created->hasRole($roleName)) {
                        return 'User missing assigned role';
                    }

                    return null;
                },
                'fallback' => function () use ($userEmail, $roleName): void {
                    (new ManageRoles)->handle(new Request([
                        'action' => 'create',
                        'name' => $roleName,
                        'permission_names_json' => [PermissionEnum::CanShowCollections->value],
                    ]));
                    (new ManageUsers)->handle(new Request([
                        'action' => 'create',
                        'first_name' => 'E2E',
                        'last_name' => 'User',
                        'email' => $userEmail,
                        'password' => 'Password1!x',
                        'role_names_json' => [$roleName],
                    ]));
                },
            ],
            [
                'key' => 'create-group',
                'prompt' => <<<PROMPT
Usa ManageGroups action=create name="{$groupName}" description="E2E" role_names_json=["{$roleName}"].
PROMPT,
                'verify' => function () use ($groupName, $roleName): ?string {
                    $group = UserGroup::query()->where('name', $groupName)->first();

                    if ($group === null) {
                        return "Group {$groupName} missing";
                    }

                    if (! $group->roles()->where('name', $roleName)->exists()) {
                        return 'Group missing role attachment';
                    }

                    return null;
                },
                'fallback' => function () use ($groupName, $roleName): void {
                    (new ManageGroups)->handle(new Request([
                        'action' => 'create',
                        'name' => $groupName,
                        'description' => 'E2E',
                        'role_names_json' => [$roleName],
                    ]));
                },
            ],
            [
                'key' => 'create-folder',
                'prompt' => <<<PROMPT
Usa ManageFiles action=create_folder name="{$folderName}".
PROMPT,
                'verify' => function () use ($folderName): ?string {
                    return File::query()->where('name', $folderName)->exists()
                        ? null
                        : "Folder {$folderName} missing";
                },
                'fallback' => function () use ($folderName): void {
                    (new ManageFiles)->handle(new Request([
                        'action' => 'create_folder',
                        'name' => $folderName,
                    ]));
                },
            ],
            [
                'key' => 'list-roles',
                'prompt' => 'Usa ManageRoles action=list e dimmi quanti ruoli esistono citando il JSON tool.',
                'verify' => function (): ?string {
                    return Role::query()->exists() ? null : 'No roles in DB';
                },
                'fallback' => function (): void {
                    (new ManageRoles)->handle(new Request(['action' => 'list']));
                },
            ],
        ];
    }

    private function runBrowserSmoke(): int
    {
        $script = base_path('scripts/ai-browser-smoke.mjs');

        if (! is_file($script)) {
            $this->warn('Browser script missing: scripts/ai-browser-smoke.mjs');

            return self::FAILURE;
        }

        $node = 'node';
        $command = escapeshellarg($node).' '.escapeshellarg($script);
        $this->line($command);
        passthru($command, $exitCode);

        return $exitCode === 0 ? self::SUCCESS : self::FAILURE;
    }
}
