<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('prizes', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->unsignedInteger('stock')->default(0);
            $table->unsignedInteger('weight')->default(1);
            $table->decimal('pool_threshold', 14, 2)->default(0);
            $table->decimal('reward_amount', 14, 2)->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['is_active', 'stock']);
            $table->index('pool_threshold');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('prizes');
    }
};
