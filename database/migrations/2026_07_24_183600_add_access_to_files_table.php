<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('files', function (Blueprint $table) {
            // null = inherit from nearest ancestor; public|private = override
            $table->string('access', 16)->nullable()->after('type')->index();
        });

        DB::table('files')->whereNull('access')->update(['access' => 'public']);
    }

    public function down(): void
    {
        Schema::table('files', function (Blueprint $table) {
            $table->dropColumn('access');
        });
    }
};
