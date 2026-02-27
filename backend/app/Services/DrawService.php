<?php

namespace App\Services;

use App\Models\DrawRecord;
use App\Models\Prize;
use App\Models\SystemConfig;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use DomainException;
use Illuminate\Support\Facades\DB;

class DrawService
{
    public function __construct(private readonly PrizePoolService $prizePoolService)
    {
    }

    public function executeDraw(User $user): DrawRecord
    {
        return DB::transaction(function () use ($user): DrawRecord {
            $drawCost = (float) config('reward.draw_cost', 10);

            $wallet = Wallet::query()
                ->where('user_id', $user->id)
                ->lockForUpdate()
                ->firstOrFail();

            $walletBefore = (float) $wallet->balance;
            if ($walletBefore < $drawCost) {
                throw new DomainException('Insufficient balance for draw.');
            }

            $walletAfterDebit = $walletBefore - $drawCost;
            $wallet->balance = $walletAfterDebit;
            $wallet->save();

            Transaction::query()->create([
                'user_id' => $user->id,
                'wallet_id' => $wallet->id,
                'type' => 'debit_draw',
                'amount' => -$drawCost,
                'balance_before' => $walletBefore,
                'balance_after' => $walletAfterDebit,
                'metadata' => ['reason' => 'draw_cost'],
            ]);

            $status = 'miss';
            $rewardAmount = 0.0;
            $prizeId = null;

            $poolBalance = SystemConfig::getNumber('pool_balance', 0);
            $candidate = $this->prizePoolService->drawEligiblePrize($poolBalance);

            if ($candidate instanceof Prize) {
                $lockedPrize = Prize::query()->whereKey($candidate->id)->lockForUpdate()->first();

                if ($lockedPrize && $lockedPrize->is_active && $lockedPrize->stock > 0) {
                    $lockedPrize->decrement('stock');

                    $status = 'won';
                    $prizeId = $lockedPrize->id;
                    $rewardAmount = (float) $lockedPrize->reward_amount;

                    if ($rewardAmount > 0) {
                        $beforeCredit = (float) $wallet->balance;
                        $wallet->balance = $beforeCredit + $rewardAmount;
                        $wallet->save();

                        Transaction::query()->create([
                            'user_id' => $user->id,
                            'wallet_id' => $wallet->id,
                            'type' => 'credit_reward',
                            'amount' => $rewardAmount,
                            'balance_before' => $beforeCredit,
                            'balance_after' => (float) $wallet->balance,
                            'reference_type' => 'prize',
                            'reference_id' => $prizeId,
                            'metadata' => ['reason' => 'draw_reward'],
                        ]);
                    }
                } else {
                    $status = 'out_of_stock';
                }
            }

            // Pool gains draw cost, then pays reward if any.
            $newPoolBalance = $poolBalance + $drawCost - $rewardAmount;
            SystemConfig::setNumber('pool_balance', max($newPoolBalance, 0), 'Current system pool balance');

            return DrawRecord::query()->create([
                'user_id' => $user->id,
                'prize_id' => $prizeId,
                'draw_cost' => $drawCost,
                'reward_amount' => $rewardAmount,
                'status' => $status,
                'metadata' => ['pool_balance_before' => $poolBalance],
            ])->load('prize');
        }, 3);
    }
}
