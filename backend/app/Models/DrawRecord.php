<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class DrawRecord extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'prize_id',
        'draw_cost',
        'reward_amount',
        'status',
        'metadata',
    ];

    protected function casts(): array
    {
        return [
            'draw_cost' => 'decimal:2',
            'reward_amount' => 'decimal:2',
            'metadata' => 'array',
        ];
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function prize()
    {
        return $this->belongsTo(Prize::class);
    }
}
