<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('api_keys', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->string('name');
            $table->string('key_prefix', 16);
            $table->string('key_hash', 64)->unique();
            $table->foreignId('role_id')->constrained('roles')->cascadeOnDelete();
            $table->json('ip_allowlist')->nullable();
            $table->unsignedInteger('rate_limit_per_minute')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index('key_prefix');
            $table->index('revoked_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('api_keys');
    }
};
