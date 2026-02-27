<?php

namespace App\Services;

use App\Models\DrawRecord;
use App\Models\SystemConfig;
use App\Models\Transaction;
use Illuminate\Support\Facades\DB;

class AdminAnalyticsService
{
    public function summary(): array
    {
        $totalDrawCount = DrawRecord::query()->count();
        $wonCount = DrawRecord::query()->where('status', 'won')->count();
        $missCount = DrawRecord::query()->where('status', '!=', 'won')->count();

        $distribution = DrawRecord::query()
            ->select('prize_id', DB::raw('COUNT(*) AS total'))
            ->whereNotNull('prize_id')
            ->groupBy('prize_id')
            ->orderByDesc('total')
            ->get();

        $topSpenders = Transaction::query()
            ->select('user_id', DB::raw('ABS(SUM(amount)) AS spent'))
            ->where('type', 'debit_draw')
            ->groupBy('user_id')
            ->orderByDesc('spent')
            ->limit(20)
            ->get();

        return [
            'total_draw_count' => $totalDrawCount,
            'won_count' => $wonCount,
            'miss_count' => $missCount,
            'win_rate' => $totalDrawCount > 0 ? round($wonCount / $totalDrawCount, 4) : 0,
            'distribution' => $distribution,
            'system_pool_balance' => SystemConfig::getNumber('pool_balance', 0),
            'top_spenders' => $topSpenders,
        ];
    }
}
