<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_groups', function (Blueprint $table) {
            $table->id();

            $table->unsignedBigInteger('created_by')->nullable();
            $table->unsignedBigInteger('updated_by')->nullable();
            $table->unsignedBigInteger('deleted_by')->nullable();

            $table->string('name')->unique();
            $table->text('description')->nullable();

            $table->timestamps();
            $table->softDeletes();

            $table->foreign('created_by')->references('id')->on('users');
            $table->foreign('updated_by')->references('id')->on('users');
            $table->foreign('deleted_by')->references('id')->on('users');
        });

        Schema::create('user_group_user', function (Blueprint $table) {
            $table->foreignId('user_group_id')->constrained('user_groups')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['user_group_id', 'user_id']);
        });

        Schema::create('user_group_role', function (Blueprint $table) {
            $table->foreignId('user_group_id')->constrained('user_groups')->cascadeOnDelete();
            $table->unsignedBigInteger('role_id');
            $table->timestamps();

            $table->unique(['user_group_id', 'role_id']);

            $table->foreign('role_id')
                ->references('id')
                ->on(config('permission.table_names.roles', 'roles'))
                ->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_group_role');
        Schema::dropIfExists('user_group_user');
        Schema::dropIfExists('user_groups');
    }
};
