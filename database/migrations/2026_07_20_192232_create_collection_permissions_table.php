<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('collection_permissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('role_id')->constrained('roles')->cascadeOnDelete();
            $table->foreignId('collection_id')->constrained('collections')->cascadeOnDelete();
            $table->string('action', 32);
            $table->boolean('allowed')->default(false);
            $table->json('rules')->nullable();
            $table->timestamps();

            $table->unique(['role_id', 'collection_id', 'action']);
            $table->index('role_id');
            $table->index('collection_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('collection_permissions');
    }
};
