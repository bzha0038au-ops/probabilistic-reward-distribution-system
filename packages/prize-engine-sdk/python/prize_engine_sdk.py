from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import hashlib
import json
import random
import time
from typing import Any, Literal, NotRequired, Required, TypedDict
from urllib import error, parse, request
import uuid
import warnings

Environment = Literal["sandbox", "live"]

PRIZE_ENGINE_API_ROUTES = {
    "overview": "/v1/engine/overview",
    "fairness_commit": "/v1/engine/fairness/commit",
    "fairness_reveal": "/v1/engine/fairness/reveal",
    "observability_distribution": "/v1/engine/observability/distribution",
    "rewards": "/v1/engine/rewards",
    "draws": "/v1/engine/draws",
    "ledger": "/v1/engine/ledger",
}
PRIZE_ENGINE_AGENT_ID_HEADER = "X-Agent-Id"


class AgentInput(TypedDict, total=False):
    agentId: Required[str]
    groupId: str | None
    metadata: dict[str, Any]


class BehaviorInput(TypedDict, total=False):
    actionType: Required[str]
    score: Required[float]
    context: dict[str, Any]
    signals: dict[str, Any]


class BudgetInput(TypedDict, total=False):
    amount: str
    currency: str
    window: Literal["request", "hour", "day", "week", "month"]


class RewardRequest(TypedDict, total=False):
    environment: Environment
    agent: Required[AgentInput]
    behavior: Required[BehaviorInput]
    riskEnvelope: dict[str, Any]
    budget: BudgetInput
    idempotencyKey: Required[str]
    clientNonce: str | None


class DrawRequest(TypedDict, total=False):
    environment: Environment
    player: dict[str, Any]
    clientNonce: str | None
    risk: float
    groupId: str | None
    group_id: str | None
    agent: dict[str, Any]
    riskEnvelope: dict[str, Any]
    rewardContext: dict[str, Any]
    idempotencyKey: str


class ApiErrorPayload(TypedDict, total=False):
    message: str
    code: NotRequired[str]
    details: NotRequired[dict[str, Any]]


class ApiResult(TypedDict, total=False):
    ok: bool
    data: dict[str, Any]
    error: ApiErrorPayload
    requestId: NotRequired[str]
    traceId: NotRequired[str]
    status: int


@dataclass(frozen=True, slots=True)
class RetryConfig:
    max_attempts: int = 3
    base_delay_ms: int = 250
    max_delay_ms: int = 2500
    jitter_ratio: float = 0.2
    retryable_status_codes: tuple[int, ...] = (429, 500, 502, 503, 504)
    respect_retry_after: bool = True


def create_idempotency_key() -> str:
    return f"pe_reward_{uuid.uuid4()}"


def _trim_trailing_slash(value: str) -> str:
    return value.rstrip("/")


def _to_query(params: dict[str, Any]) -> str:
    filtered = {key: value for key, value in params.items() if value not in (None, "")}
    if not filtered:
        return ""
    return "?" + parse.urlencode(filtered)


def _build_reward_request_signature(payload: dict[str, Any]) -> str:
    normalized = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _parse_retry_after_ms(value: str | None) -> int | None:
    if not value:
        return None

    try:
        seconds = float(value)
    except ValueError:
        seconds = None

    if seconds is not None and seconds >= 0:
        return int(seconds * 1000)

    try:
        parsed = parsedate_to_datetime(value)
    except (TypeError, ValueError, IndexError):
        return None

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    delay_seconds = (parsed - datetime.now(timezone.utc)).total_seconds()
    if delay_seconds <= 0:
        return 0
    return int(delay_seconds * 1000)


def _calculate_delay_ms(attempt: int, retry_after: str | None, retry: RetryConfig) -> int:
    if retry.respect_retry_after:
        retry_after_ms = _parse_retry_after_ms(retry_after)
        if retry_after_ms is not None:
            return retry_after_ms

    exponential = retry.base_delay_ms * (2 ** max(attempt - 1, 0))
    capped = min(exponential, retry.max_delay_ms)
    jitter_window = capped * retry.jitter_ratio
    lower_bound = max(capped - jitter_window, 0)
    upper_bound = capped + jitter_window
    return int(random.uniform(lower_bound, upper_bound))


def _can_retry(method: str, idempotency_key: str | None) -> bool:
    return method in {"GET", "HEAD", "OPTIONS"} or bool(idempotency_key)


class _ObservabilityClient:
    def __init__(self, client: "PrizeEngineClient") -> None:
        self._client = client

    def distribution(self, days: int = 7) -> ApiResult:
        return self._client._request(
            "GET",
            PRIZE_ENGINE_API_ROUTES["observability_distribution"]
            + _to_query(
                {
                    "environment": self._client.environment,
                    "days": days,
                }
            ),
        )


class PrizeEngineClient:
    def __init__(
        self,
        *,
        base_url: str,
        environment: Environment,
        api_key: str | None = None,
        default_headers: dict[str, str] | None = None,
        retry: RetryConfig = RetryConfig(),
        timeout_seconds: float = 30.0,
    ) -> None:
        self.base_url = _trim_trailing_slash(base_url)
        self.environment = environment
        self.api_key = api_key
        self.default_headers = default_headers or {}
        self.retry = retry
        self.timeout_seconds = timeout_seconds
        self.observability = _ObservabilityClient(self)

    def get_overview(self) -> ApiResult:
        return self._request(
            "GET",
            PRIZE_ENGINE_API_ROUTES["overview"]
            + _to_query({"environment": self.environment}),
        )

    def get_fairness_commit(self) -> ApiResult:
        return self._request(
            "GET",
            PRIZE_ENGINE_API_ROUTES["fairness_commit"]
            + _to_query({"environment": self.environment}),
        )

    def reveal_fairness_seed(self, epoch: int) -> ApiResult:
        return self._request(
            "GET",
            PRIZE_ENGINE_API_ROUTES["fairness_reveal"]
            + _to_query({"environment": self.environment, "epoch": epoch}),
        )

    def get_ledger(self, player_id: str, limit: int = 50) -> ApiResult:
        return self._request(
            "GET",
            PRIZE_ENGINE_API_ROUTES["ledger"]
            + _to_query(
                {
                    "environment": self.environment,
                    "playerId": player_id,
                    "limit": limit,
                }
            ),
        )

    def reward(
        self,
        payload: RewardRequest,
        *,
        agent_id: str | None = None,
        idempotency_key: str | None = None,
        headers: dict[str, str] | None = None,
    ) -> ApiResult:
        normalized_idempotency_key = (
            idempotency_key
            or payload.get("idempotencyKey")
        )
        if not normalized_idempotency_key:
            raise ValueError("Reward requests require idempotencyKey.")

        environment = payload.get("environment") or self.environment
        agent = payload["agent"]
        behavior = payload["behavior"]
        risk_envelope = payload.get("riskEnvelope")
        budget = payload.get("budget")

        request_signature = _build_reward_request_signature(
            {
                "environment": environment,
                "agent": agent,
                "behavior": behavior,
                "riskEnvelope": risk_envelope,
                "budget": budget,
                "clientNonce": payload.get("clientNonce"),
            }
        )
        reward_payload: RewardRequest = {
            **payload,
            "environment": environment,
            "idempotencyKey": normalized_idempotency_key,
        }

        request_headers = dict(headers or {})
        request_headers.setdefault(
            "X-Prize-Engine-Request-Signature", request_signature
        )
        request_headers.setdefault(
            "X-Prize-Engine-Behavior-Template", behavior["actionType"]
        )
        if agent.get("groupId"):
            request_headers.setdefault(
                "X-Prize-Engine-Correlation-Group", str(agent["groupId"])
            )

        return self._request(
            "POST",
            PRIZE_ENGINE_API_ROUTES["rewards"],
            json_body=reward_payload,
            agent_id=agent_id or agent["agentId"],
            idempotency_key=normalized_idempotency_key,
            headers=request_headers,
        )

    def draw(
        self,
        payload: DrawRequest,
        *,
        agent_id: str | None = None,
        idempotency_key: str | None = None,
        headers: dict[str, str] | None = None,
    ) -> ApiResult:
        warnings.warn(
            "PrizeEngineClient.draw() is deprecated; use reward() instead.",
            DeprecationWarning,
            stacklevel=2,
        )
        request_body = dict(payload)
        request_body.setdefault("environment", self.environment)
        normalized_idempotency_key = idempotency_key or payload.get("idempotencyKey")
        reward_context = payload.get("rewardContext") or {}
        resolved_agent_id = agent_id or reward_context.get("agent", {}).get("agentId")
        return self._request(
            "POST",
            PRIZE_ENGINE_API_ROUTES["draws"],
            json_body=request_body,
            agent_id=resolved_agent_id,
            idempotency_key=normalized_idempotency_key,
            headers=headers,
        )

    def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: dict[str, Any] | None = None,
        agent_id: str | None = None,
        idempotency_key: str | None = None,
        headers: dict[str, str] | None = None,
    ) -> ApiResult:
        attempt = 0
        encoded_body = None
        if json_body is not None:
            encoded_body = json.dumps(json_body).encode("utf-8")

        while True:
            attempt += 1
            request_headers = {"Accept": "application/json", **self.default_headers}
            if json_body is not None:
                request_headers["Content-Type"] = "application/json"
            if self.api_key:
                request_headers["Authorization"] = f"Bearer {self.api_key}"
            if agent_id:
                request_headers[PRIZE_ENGINE_AGENT_ID_HEADER] = agent_id
            if idempotency_key:
                request_headers["Idempotency-Key"] = idempotency_key
            if headers:
                request_headers.update(headers)

            http_request = request.Request(
                url=f"{self.base_url}{path}",
                data=encoded_body,
                headers=request_headers,
                method=method,
            )

            try:
                with request.urlopen(http_request, timeout=self.timeout_seconds) as response:
                    status = response.status
                    raw_body = response.read().decode("utf-8")
                    parsed_body = json.loads(raw_body) if raw_body else {}
            except error.HTTPError as exc:
                status = exc.code
                raw_body = exc.read().decode("utf-8")
                parsed_body = json.loads(raw_body) if raw_body else {}
                retry_after = exc.headers.get("Retry-After")
                if (
                    status in self.retry.retryable_status_codes
                    and attempt < self.retry.max_attempts
                    and _can_retry(method, idempotency_key)
                ):
                    time.sleep(
                        _calculate_delay_ms(attempt, retry_after, self.retry) / 1000
                    )
                    continue
                return {
                    "ok": False,
                    "error": parsed_body.get("error", {"message": "Request failed."}),
                    "requestId": parsed_body.get("requestId"),
                    "traceId": parsed_body.get("traceId"),
                    "status": status,
                }
            except error.URLError:
                if attempt < self.retry.max_attempts and _can_retry(
                    method, idempotency_key
                ):
                    time.sleep(_calculate_delay_ms(attempt, None, self.retry) / 1000)
                    continue
                raise

            if (
                status in self.retry.retryable_status_codes
                and attempt < self.retry.max_attempts
                and _can_retry(method, idempotency_key)
            ):
                time.sleep(
                    _calculate_delay_ms(
                        attempt, response.headers.get("Retry-After"), self.retry
                    )
                    / 1000
                )
                continue

            if status >= 400 or not parsed_body.get("ok"):
                return {
                    "ok": False,
                    "error": parsed_body.get("error", {"message": "Request failed."}),
                    "requestId": parsed_body.get("requestId"),
                    "traceId": parsed_body.get("traceId"),
                    "status": status,
                }

            return {
                "ok": True,
                "data": parsed_body.get("data", {}),
                "requestId": parsed_body.get("requestId"),
                "traceId": parsed_body.get("traceId"),
                "status": status,
            }
