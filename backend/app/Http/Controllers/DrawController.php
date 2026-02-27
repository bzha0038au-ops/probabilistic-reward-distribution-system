<?php

namespace App\Http\Controllers;

use App\Services\DrawService;
use DomainException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DrawController extends Controller
{
    public function __construct(private readonly DrawService $drawService)
    {
    }

    public function draw(Request $request): JsonResponse
    {
        try {
            $record = $this->drawService->executeDraw($request->user());

            return response()->json([
                'message' => 'Draw completed.',
                'data' => $record,
            ]);
        } catch (DomainException $exception) {
            return response()->json([
                'message' => $exception->getMessage(),
            ], 422);
        }
    }
}
