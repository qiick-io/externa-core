<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Stop deleting a role from cascading every API key that still holds it (#833).
 *
 * The create migration kept `cascadeOnDelete` for installs that already ran it; this
 * additive change switches the live FK to `restrictOnDelete` so a raw DELETE cannot
 * wipe keys either. Application code refuses the delete first with a counted message.
 *
 * Re-runnable after a partial MySQL failure: drop and add are each gated on
 * {@see Schema::getForeignKeys()}. Not wrapped in a transaction — on SQLite that would
 * turn foreign-key enforcement off for the rebuild.
 */
return new class extends Migration
{
    public function up(): void
    {
        $roleForeignKey = $this->roleIdForeignKey();

        if ($roleForeignKey !== null && $this->isRestrictOnDelete($roleForeignKey)) {
            return;
        }

        if ($roleForeignKey !== null) {
            Schema::table('api_keys', function (Blueprint $table) use ($roleForeignKey): void {
                $table->dropForeign($roleForeignKey['name'] ?? ['role_id']);
            });
        }

        if ($this->roleIdForeignKey() !== null) {
            return;
        }

        Schema::table('api_keys', function (Blueprint $table): void {
            $table->foreign('role_id')->references('id')->on('roles')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        $roleForeignKey = $this->roleIdForeignKey();

        if ($roleForeignKey !== null && ! $this->isRestrictOnDelete($roleForeignKey)) {
            return;
        }

        if ($roleForeignKey !== null) {
            Schema::table('api_keys', function (Blueprint $table) use ($roleForeignKey): void {
                $table->dropForeign($roleForeignKey['name'] ?? ['role_id']);
            });
        }

        if ($this->roleIdForeignKey() !== null) {
            return;
        }

        Schema::table('api_keys', function (Blueprint $table): void {
            $table->foreign('role_id')->references('id')->on('roles')->cascadeOnDelete();
        });
    }

    /**
     * @return array{name: string|null, columns: list<string>, foreign_schema: string|null, foreign_table: string, foreign_columns: list<string>, on_update: string|null, on_delete: string|null}|null
     */
    private function roleIdForeignKey(): ?array
    {
        foreach (Schema::getForeignKeys('api_keys') as $foreignKey) {
            if ($foreignKey['columns'] === ['role_id']) {
                return $foreignKey;
            }
        }

        return null;
    }

    /**
     * @param  array{on_delete: string|null}  $foreignKey
     */
    private function isRestrictOnDelete(array $foreignKey): bool
    {
        return in_array(strtolower((string) $foreignKey['on_delete']), ['restrict', 'no action'], true);
    }
};
