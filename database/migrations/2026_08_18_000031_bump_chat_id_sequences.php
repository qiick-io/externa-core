<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $driver = Schema::getConnection()->getDriverName();

        foreach (['chat_messages', 'chat_reactions', 'chat_participants'] as $table) {
            if (! Schema::hasTable($table)) {
                continue;
            }

            $max = (int) (DB::table($table)->max('id') ?? 0);
            if ($max < 1) {
                continue;
            }

            if ($driver === 'pgsql') {
                DB::select("SELECT setval(pg_get_serial_sequence('{$table}', 'id'), {$max})");
            } elseif (in_array($driver, ['mysql', 'mariadb'], true)) {
                DB::statement("ALTER TABLE {$table} AUTO_INCREMENT = ".($max + 1));
            } elseif ($driver === 'sqlite') {
                $exists = DB::table('sqlite_sequence')->where('name', $table)->exists();
                if ($exists) {
                    DB::table('sqlite_sequence')->where('name', $table)->update(['seq' => $max]);
                } else {
                    DB::table('sqlite_sequence')->insert(['name' => $table, 'seq' => $max]);
                }
            }
        }
    }

    public function down(): void
    {
        // Sequence bump is not reversible.
    }
};
