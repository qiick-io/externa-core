<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('files', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('created_by')->nullable()->constrained('users');
            $table->foreignId('updated_by')->nullable()->constrained('users');
            $table->foreignId('deleted_by')->nullable()->constrained('users');
            $table->foreignId('parent_id')
                ->nullable()
                ->constrained('files')
                ->nullOnDelete();
            $table->string('type')->index();
            $table->string('name');
            $table->string('path')->index();
            $table->string('disk')->default('assets');
            $table->string('storage_path')->nullable();
            $table->string('hash', 64)->nullable();
            $table->string('mime_type')->nullable();
            $table->string('extension')->nullable();
            $table->unsignedBigInteger('size')->nullable();
            $table->unsignedInteger('width')->nullable();
            $table->unsignedInteger('height')->nullable();
            $table->json('meta')->nullable();
            $table->decimal('focal_point_x', 10, 6)->nullable();
            $table->decimal('focal_point_y', 10, 6)->nullable();
            $table->decimal('translate_x', 10, 6)->nullable();
            $table->decimal('translate_y', 10, 6)->nullable();
            $table->decimal('scale', 10, 6)->nullable();
            $table->foreignId('current_version_id')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['parent_id', 'name']);
            $table->index('disk');
            $table->index('hash');
        });

        Schema::create('file_versions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('created_by')->nullable()->constrained('users');
            $table->foreignId('updated_by')->nullable()->constrained('users');
            $table->foreignId('deleted_by')->nullable()->constrained('users');
            $table->foreignId('file_id')
                ->nullable()
                ->constrained('files')
                ->nullOnDelete();
            $table->string('disk');
            $table->string('storage_path');
            $table->string('hash', 64)->nullable()->index();
            $table->string('mime_type')->nullable();
            $table->unsignedBigInteger('size');
            $table->unsignedInteger('width')->nullable();
            $table->unsignedInteger('height')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->index(['file_id', 'created_at']);
        });

        Schema::create('file_uploads', function (Blueprint $table) {
            $table->id();
            $table->foreignId('created_by')->nullable()->constrained('users');
            $table->foreignId('updated_by')->nullable()->constrained('users');
            $table->foreignId('deleted_by')->nullable()->constrained('users');
            $table->string('upload_id', 64)->unique();
            $table->string('file_name');
            $table->string('mime_type')->nullable();
            $table->unsignedBigInteger('total_size');
            $table->unsignedInteger('total_chunks');
            $table->unsignedInteger('uploaded_chunks')->default(0);
            $table->string('disk')->default('assets');
            $table->unsignedBigInteger('parent_id')->nullable();
            $table->json('chunks_info')->nullable();
            $table->timestamp('expires_at');
            $table->timestamps();

            $table->index('upload_id');
            $table->index('expires_at');
            $table->foreign('parent_id')
                ->references('id')
                ->on('files')
                ->nullOnDelete();
        });

        Schema::create('fileables', function (Blueprint $table) {
            $table->id();
            $table->foreignId('file_id')
                ->constrained('files')
                ->cascadeOnDelete();
            $table->unsignedBigInteger('fileable_id');
            $table->string('fileable_type');
            $table->string('role')->nullable();
            $table->unsignedInteger('order')->default(0);
            $table->timestamps();

            $table->unique(['file_id', 'fileable_id', 'fileable_type', 'role']);
            $table->index(['fileable_id', 'fileable_type']);
        });

        Schema::table('files', function (Blueprint $table) {
            $table->foreign('current_version_id')
                ->references('id')
                ->on('file_versions')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('files', function (Blueprint $table) {
            $table->dropForeign(['current_version_id']);
        });

        Schema::dropIfExists('fileables');
        Schema::dropIfExists('file_uploads');
        Schema::dropIfExists('file_versions');
        Schema::dropIfExists('files');
    }
};
