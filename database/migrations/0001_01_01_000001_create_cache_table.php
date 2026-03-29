<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * This method is called when the migration is executed.
     * It creates the 'cache' and 'cache_locks' tables used by Laravel's cache system.
     */
    public function up(): void
    {
        // Create the 'cache' table to store cached items.
        Schema::create('cache', function (Blueprint $table) {
            $table->string('key')->primary();          // Unique cache key (primary key)
            $table->mediumText('value');               // Cached data
            $table->integer('expiration')->index();    // Expiration timestamp, indexed for efficient queries
        });

        // Create the 'cache_locks' table to manage cache locks.
        Schema::create('cache_locks', function (Blueprint $table) {
            $table->string('key')->primary();          // Unique lock key (primary key)
            $table->string('owner');                   // Identifier for the owner of the lock
            $table->integer('expiration')->index();    // Expiration timestamp, indexed for efficient queries
        });
    }

    /**
     * Reverse the migrations.
     *
     * This method is called when the migration is rolled back.
     * It drops the 'cache' and 'cache_locks' tables.
     */
    public function down(): void
    {
        Schema::dropIfExists('cache');        // Drop the 'cache' table if it exists
        Schema::dropIfExists('cache_locks');  // Drop the 'cache_locks' table if it exists
    }
};
