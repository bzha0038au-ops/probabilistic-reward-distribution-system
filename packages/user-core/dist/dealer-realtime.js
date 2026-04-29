import { DEALER_EVENT_FEED_LIMIT, DEALER_REALTIME_ACTION_EVENT, DEALER_REALTIME_MESSAGE_EVENT, DEALER_REALTIME_PACE_HINT_EVENT, DealerEventSchema, } from "@reward/shared-types/dealer";
import { REALTIME_CLOSE_CODES, RealtimeServerMessageSchema, } from "@reward/shared-types/realtime";
import { resolveUserRealtimeUrl } from "./api";
const WS_OPEN = 1;
export const applyDealerEventFeed = (params) => {
    const maxEvents = Math.max(1, params.maxEvents ?? DEALER_EVENT_FEED_LIMIT);
    const nextEvents = [
        ...params.currentEvents.filter((entry) => entry.id !== params.event.id),
        DealerEventSchema.parse(params.event),
    ];
    nextEvents.sort((left, right) => {
        const leftTime = new Date(left.createdAt).getTime();
        const rightTime = new Date(right.createdAt).getTime();
        if (leftTime !== rightTime) {
            return leftTime - rightTime;
        }
        return left.id.localeCompare(right.id);
    });
    return nextEvents.slice(-maxEvents);
};
export const createDealerRealtimeClient = (params) => {
    let socket = null;
    let disposed = false;
    let started = false;
    let hasAttemptedConnection = false;
    let reconnectTimer = null;
    let currentStatus = "connecting";
    const setStatus = (status) => {
        currentStatus = status;
        params.onConnectionStatusChange?.(status);
    };
    const clearReconnectTimer = () => {
        if (reconnectTimer !== null) {
            window.clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
    };
    const scheduleReconnect = () => {
        if (disposed || reconnectTimer !== null) {
            return;
        }
        reconnectTimer = window.setTimeout(() => {
            reconnectTimer = null;
            void connect();
        }, 2000);
    };
    const connect = async () => {
        if (disposed) {
            return;
        }
        setStatus(hasAttemptedConnection ? "reconnecting" : "connecting");
        hasAttemptedConnection = true;
        let authToken;
        try {
            authToken = await params.getAuthToken();
        }
        catch (error) {
            params.onWarning?.(error instanceof Error
                ? error.message
                : "Failed to prepare dealer realtime auth token.");
            setStatus("reconnecting");
            scheduleReconnect();
            return;
        }
        if (!authToken) {
            await params.onUnauthorized();
            return;
        }
        const nextSocket = new WebSocket(resolveUserRealtimeUrl({
            baseUrl: params.baseUrl,
            authToken,
        }));
        socket = nextSocket;
        nextSocket.onopen = () => {
            if (!disposed) {
                setStatus("live");
            }
        };
        nextSocket.onmessage = (event) => {
            let json;
            try {
                json = JSON.parse(String(event.data));
            }
            catch {
                return;
            }
            const parsed = RealtimeServerMessageSchema.safeParse(json);
            if (!parsed.success) {
                return;
            }
            if (parsed.data.type === "transport.ping") {
                if (nextSocket.readyState === WS_OPEN) {
                    nextSocket.send(JSON.stringify({
                        type: "transport.pong",
                        pingId: parsed.data.pingId,
                        sentAt: new Date().toISOString(),
                    }));
                }
                return;
            }
            if (parsed.data.type === "transport.error") {
                params.onWarning?.(parsed.data.message);
                return;
            }
            if (parsed.data.type !== "transport.event") {
                return;
            }
            if (parsed.data.event !== DEALER_REALTIME_ACTION_EVENT &&
                parsed.data.event !== DEALER_REALTIME_MESSAGE_EVENT &&
                parsed.data.event !== DEALER_REALTIME_PACE_HINT_EVENT) {
                return;
            }
            const payload = DealerEventSchema.safeParse(parsed.data.data);
            if (!payload.success) {
                return;
            }
            params.onDealerEvent(payload.data);
        };
        nextSocket.onclose = async (event) => {
            socket = null;
            if (disposed) {
                return;
            }
            if (event.code === REALTIME_CLOSE_CODES.SESSION_REVOKED) {
                await params.onUnauthorized();
                return;
            }
            setStatus("reconnecting");
            scheduleReconnect();
        };
    };
    return {
        start() {
            if (started || disposed) {
                return;
            }
            started = true;
            params.onConnectionStatusChange?.(currentStatus);
            void connect();
        },
        stop() {
            disposed = true;
            clearReconnectTimer();
            socket?.close();
            socket = null;
        },
    };
};
