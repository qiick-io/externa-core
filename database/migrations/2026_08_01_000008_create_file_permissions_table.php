<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('file_permissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('role_id')->constrained('roles')->cascadeOnDelete();
            $table->string('action', 32);
            $table->boolean('allowed')->default(false);
            $table->timestamps();

            $table->unique(['role_id', 'action']);
            $table->index('role_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('file_permissions');
    }
};
