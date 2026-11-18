<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Translate the 1.4.0 API key permissions into the shared `<resource>:<read|write>` scopes
 * (#781), then drop the two columns that carried permission meaning.
 *
 * 1.4.0 decided a request with three values; each key now gets the scopes it was actually
 * allowed, never more:
 *
 * - collections were open to every key (the role decides): `collections:write`, or
 *   `collections:read` when `read_only` was set;
 * - `files_scope`: `read` → `files:read`, `all` → `files:write` (write implies read), `none`
 *   or any other value → no files scope (the enum cast refused other values, so such a key
 *   never reached a file);
 * - `scopes` (MCP only): `mcp:read` → `mcp:read`, `mcp:read` + `mcp:write` → `mcp:write`.
 *   `mcp:write` without `mcp:read` grants nothing: `/mcp` refused that key at the door.
 *   Entries outside those two are dropped, never translated into a grant;
 * - `read_only` turns every scope into its `:read` form. That settles the contradiction
 *   1.4.0 allowed, `read_only` with `files_scope = all`, as `files:read`: read-only already
 *   won at request time.
 *
 * Every translated key keeps at least `collections:read`, so no row ends empty. A key that
 * somehow holds an empty list later is kept, not revoked, and refused on every request
 * (fail closed). Revoked and expired keys are translated like the others and stay revoked
 * or expired. Only `scopes` is written: `updated_at` and every other column are left alone.
 *
 * Forward-only: the dropped values cannot be rebuilt from the scopes.
 */
return new class extends Migration
{
    private const string READ = 'read';

    private const string WRITE = 'write';

    public function up(): void
    {
        DB::table('api_keys')
            ->select(['id', 'read_only', 'files_scope', 'scopes'])
            ->orderBy('id')
            ->chunkById(200, function ($legacyApiKeyRows): void {
                foreach ($legacyApiKeyRows as $legacyApiKeyRow) {
                    DB::table('api_keys')
                        ->where('id', $legacyApiKeyRow->id)
                        ->update(['scopes' => json_encode($this->translatedScopes($legacyApiKeyRow))]);
                }
            });

        Schema::table('api_keys', function (Blueprint $table): void {
            $table->dropColumn(['read_only', 'files_scope']);
        });
    }

    public function down(): void
    {
        //
    }

    /**
     * @return list<string>
     */
    private function translatedScopes(object $legacyApiKeyRow): array
    {
        $accessByResource = ['collections' => self::WRITE];

        $filesAccess = match ($legacyApiKeyRow->files_scope) {
            'read' => self::READ,
            'all' => self::WRITE,
            default => null,
        };

        if ($filesAccess !== null) {
            $accessByResource['files'] = $filesAccess;
        }

        $legacyScopes = $this->legacyScopes($legacyApiKeyRow->scopes);

        if (in_array('mcp:read', $legacyScopes, true)) {
            $accessByResource['mcp'] = in_array('mcp:write', $legacyScopes, true) ? self::WRITE : self::READ;
        }

        $isReadOnly = (bool) $legacyApiKeyRow->read_only;
        $translatedScopes = [];

        foreach ($accessByResource as $resource => $access) {
            $translatedScopes[] = $resource.':'.($isReadOnly ? self::READ : $access);
        }

        sort($translatedScopes);

        return $translatedScopes;
    }

    /**
     * The stored MCP scopes as a list of strings; anything that is not a JSON list grants nothing.
     *
     * @return list<string>
     */
    private function legacyScopes(mixed $storedScopes): array
    {
        if (! is_string($storedScopes)) {
            return [];
        }

        $decodedScopes = json_decode($storedScopes, true);

        if (! is_array($decodedScopes) || ! array_is_list($decodedScopes)) {
            return [];
        }

        return array_values(array_filter($decodedScopes, is_string(...)));
    }
};
