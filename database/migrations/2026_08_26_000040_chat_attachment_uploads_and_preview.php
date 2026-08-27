<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('chat_attachment_uploads', function (Blueprint $table) {
            $table->id();
            $table->string('upload_id', 64)->unique();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('file_name');
            $table->string('mime_type')->nullable();
            $table->unsignedBigInteger('total_size');
            $table->unsignedInteger('total_chunks');
            $table->unsignedInteger('uploaded_chunks')->default(0);
            $table->json('chunks_info')->nullable();
            $table->timestamp('expires_at');
            $table->timestamps();

            $table->index('expires_at');
        });

        Schema::table('chat_attachments', function (Blueprint $table) {
            $table->string('preview_path')->nullable()->after('path');
            $table->string('preview_mime', 127)->nullable()->after('preview_path');
        });
    }

    public function down(): void
    {
        Schema::table('chat_attachments', function (Blueprint $table) {
            $table->dropColumn(['preview_path', 'preview_mime']);
        });

        Schema::dropIfExists('chat_attachment_uploads');
    }
};
