<?php

namespace App\Services;

use App\Models\Transaction;
use App\Models\Wallet;
use DomainException;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

class WalletService
{
    public function getBalance(int $userId): string
    {
        return (string) Wallet::query()->where('user_id', $userId)->value('balance');
    }

    public function getHistory(int $userId, int $limit = 50): Collection
    {
        return Transaction::query()
            ->where('user_id', $userId)
            ->latest('id')
            ->limit($limit)
            ->get();
    }

    public function adjustBalance(int $userId, float $amount, string $type = 'adjustment', array $metadata = []): Wallet
    {
        return DB::transaction(function () use ($userId, $amount, $type, $metadata): Wallet {
            $wallet = Wallet::query()->where('user_id', $userId)->lockForUpdate()->firstOrFail();
            $before = (float) $wallet->balance;
            $after = $before + $amount;

            if ($after < 0) {
                throw new DomainException('Balance cannot be negative.');
            }

            $wallet->balance = $after;
            $wallet->save();

            Transaction::query()->create([
                'user_id' => $userId,
                'wallet_id' => $wallet->id,
                'type' => $type,
                'amount' => $amount,
                'balance_before' => $before,
                'balance_after' => $after,
                'metadata' => $metadata,
            ]);

            return $wallet;
        });
    }
}
