<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('settings', function (Blueprint $table) {
            $table->id();
            $table->string('scope');
            $table->unsignedBigInteger('scope_id')->nullable();
            $table->string('group');
            $table->string('key');
            $table->json('value')->nullable();
            $table->timestamps();

            $table->unique(['scope', 'scope_id', 'group', 'key']);
            $table->index(['scope', 'scope_id', 'group']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('settings');
    }
};
