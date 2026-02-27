<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Prize extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'stock',
        'weight',
        'pool_threshold',
        'reward_amount',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'stock' => 'integer',
            'weight' => 'integer',
            'pool_threshold' => 'decimal:2',
            'reward_amount' => 'decimal:2',
            'is_active' => 'boolean',
        ];
    }

    public function drawRecords()
    {
        return $this->hasMany(DrawRecord::class);
    }
}
