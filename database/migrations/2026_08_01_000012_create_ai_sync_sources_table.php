<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_sync_sources', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('collection_id')->constrained('collections')->cascadeOnDelete();
            $table->text('url');
            $table->string('upsert_key')->nullable();
            $table->unsignedInteger('interval_minutes')->default(60);
            $table->text('auth_bearer')->nullable();
            $table->timestamp('last_run_at')->nullable();
            $table->string('last_status')->nullable();
            $table->boolean('enabled')->default(true);
            $table->timestamps();

            $table->index(['enabled', 'last_run_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_sync_sources');
    }
};
