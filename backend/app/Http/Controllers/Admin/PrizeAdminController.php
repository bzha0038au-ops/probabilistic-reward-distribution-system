<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Prize;
use App\Services\PrizePoolService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PrizeAdminController extends Controller
{
    public function __construct(private readonly PrizePoolService $prizePoolService)
    {
    }

    public function index(): JsonResponse
    {
        return response()->json([
            'data' => Prize::query()->latest('id')->get(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $payload = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'stock' => ['required', 'integer', 'min:0'],
            'weight' => ['required', 'integer', 'min:0'],
            'pool_threshold' => ['required', 'numeric', 'min:0'],
            'reward_amount' => ['required', 'numeric', 'min:0'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $prize = Prize::query()->create($payload);

        return response()->json([
            'message' => 'Prize created.',
            'data' => $prize,
        ], 201);
    }

    public function update(Request $request, Prize $prize): JsonResponse
    {
        $payload = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'stock' => ['sometimes', 'integer', 'min:0'],
            'weight' => ['sometimes', 'integer', 'min:0'],
            'pool_threshold' => ['sometimes', 'numeric', 'min:0'],
            'reward_amount' => ['sometimes', 'numeric', 'min:0'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $updated = $this->prizePoolService->updatePrizeConfig($prize, $payload);

        return response()->json([
            'message' => 'Prize updated.',
            'data' => $updated,
        ]);
    }

    public function toggle(Prize $prize): JsonResponse
    {
        $prize->is_active = ! $prize->is_active;
        $prize->save();

        return response()->json([
            'message' => 'Prize status toggled.',
            'data' => $prize,
        ]);
    }
}
