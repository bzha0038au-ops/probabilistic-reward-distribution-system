<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SystemConfig extends Model
{
    use HasFactory;

    protected $table = 'system_config';

    protected $fillable = [
        'config_key',
        'config_value',
        'description',
    ];

    protected function casts(): array
    {
        return [
            'config_value' => 'array',
        ];
    }

    public static function getNumber(string $key, float $default = 0): float
    {
        $record = static::query()->where('config_key', $key)->first();

        if (! $record || ! is_array($record->config_value)) {
            return $default;
        }

        return (float) ($record->config_value['value'] ?? $default);
    }

    public static function setNumber(string $key, float $value, ?string $description = null): void
    {
        static::query()->updateOrCreate(
            ['config_key' => $key],
            [
                'config_value' => ['value' => $value],
                'description' => $description,
            ]
        );
    }
}
