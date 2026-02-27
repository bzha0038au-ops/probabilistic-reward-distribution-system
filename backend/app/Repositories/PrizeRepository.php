<?php

namespace App\Repositories;

use App\Models\Prize;
use Illuminate\Support\Collection;

class PrizeRepository
{
    public function getEligible(float $poolBalance): Collection
    {
        return Prize::query()
            ->where('is_active', true)
            ->where('stock', '>', 0)
            ->where('pool_threshold', '<=', $poolBalance)
            ->where('weight', '>', 0)
            ->get();
    }

    public function drawByWeight(float $poolBalance): ?Prize
    {
        $eligible = $this->getEligible($poolBalance);

        if ($eligible->isEmpty()) {
            return null;
        }

        $totalWeight = (int) $eligible->sum('weight');

        if ($totalWeight <= 0) {
            return null;
        }

        $pick = random_int(1, $totalWeight);
        $cursor = 0;

        foreach ($eligible as $prize) {
            $cursor += (int) $prize->weight;
            if ($pick <= $cursor) {
                return $prize;
            }
        }

        return $eligible->last();
    }
}
