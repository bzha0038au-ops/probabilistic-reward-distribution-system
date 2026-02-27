<?php

namespace App\Http\Controllers;

use App\Services\WalletService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WalletController extends Controller
{
    public function __construct(private readonly WalletService $walletService)
    {
    }

    public function show(Request $request): JsonResponse
    {
        return response()->json([
            'data' => [
                'balance' => $this->walletService->getBalance($request->user()->id),
            ],
        ]);
    }

    public function history(Request $request): JsonResponse
    {
        $limit = (int) $request->query('limit', 50);

        return response()->json([
            'data' => $this->walletService->getHistory($request->user()->id, $limit),
        ]);
    }
}
