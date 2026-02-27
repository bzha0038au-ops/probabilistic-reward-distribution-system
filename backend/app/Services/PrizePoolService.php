<?php

namespace App\Services;

use App\Models\Prize;
use App\Repositories\PrizeRepository;

class PrizePoolService
{
    public function __construct(private readonly PrizeRepository $prizeRepository)
    {
    }

    public function drawEligiblePrize(float $poolBalance): ?Prize
    {
        return $this->prizeRepository->drawByWeight($poolBalance);
    }

    public function updatePrizeConfig(Prize $prize, array $payload): Prize
    {
        $prize->fill($payload);
        $prize->save();

        return $prize;
    }
}
