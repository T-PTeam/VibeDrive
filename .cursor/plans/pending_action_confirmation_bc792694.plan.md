---
name: Pending action confirmation
overview: Add a per-user pending confirmation state so the agent proposes actions (like accept load) and only executes after an explicit confirm/reject on the next utterance. Expand the action schema and give the backend real load/route tools via the existing PHP API.
todos:
  - id: pending-action-redis
    content: Add Redis-backed `PendingAction` store keyed by `userId` with TTL; wire it into .NET DI.
    status: pending
  - id: agent-action-schema
    content: Update OpenAI prompt/response contract to support propose/confirm/reject and richer actions, including pending context.
    status: pending
  - id: redis-listener-gating
    content: Change `RedisListenerService` to propose and store pending actions; on confirm execute via PHP API and clear pending; on reject clear pending.
    status: pending
  - id: route-loads-service
    content: Replace `NoOpRouteLoadsService` with a real `RouteLoadsService` that calls the PHP API (loads/route/accept).
    status: pending
  - id: mobile-no-auto-accept
    content: Remove or disable the `accept_load` handler in `DriveScreen` so the app no longer executes acceptance directly.
    status: pending
  - id: proposal-ui
    content: Add minimal proposal/confirmation UI (voice-first, then tap buttons if desired).
    status: pending
  - id: formatting
    content: After implementation, run `npm run prettier:fix` in `mobile-app` and ensure formatting configs are respected.
    status: pending
isProject: false
---

## Current behavior (what must change)

- The model can return `{ action: "accept_load", index: n }` and the .NET service immediately emits an `accept_load` SignalR command.
- The mobile app listens for `accept_load` and immediately calls the PHP API to accept the load.

Key call sites:

- `.NET` sends `accept_load` immediately:

```369:385:/Users/mrex/Projects/VibeDrive/microservice-net/VibeDrive.Api/Services/RedisListenerService.cs
    if (normalizedAction == "accept_load" && index.HasValue && index.Value >= 1)
    {
        await SendAcceptLoadCommandAsync(userId, index.Value, cancellationToken);
        return;
    }

    private async Task SendAcceptLoadCommandAsync(string userId, int oneBasedIndex, CancellationToken cancellationToken)
    {
        var payload = new
        {
            type = "accept_load",
            data = new { index = oneBasedIndex },
            timestamp = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
        };
        // ... sends via SignalR
    }
```

- `mobile` executes accept on receipt:

```183:227:/Users/mrex/Projects/VibeDrive/mobile-app/src/screens/DriveScreen.tsx
signalRService.onMessage('accept_load', async (_message, parsed) => {
  // ... resolve index -> loadId
  const newRoute = await loadsService.acceptLoad(userId, load.id);
  // ... TTS confirmation
});
```

## Target flow

- Agent **proposes**: “I found Load #2 Hamburg → Berlin for €X. Confirm?”
- App/user replies “yes/no”.
- Agent resolves that as `confirm`/`reject` against a **server-stored** `pending_action` keyed by `userId` (Redis TTL), then executes (or cancels) accordingly.

## Data model

- Add a new server-side record:
  - `PendingAction` (stored in Redis as JSON) with:
    - `type` (e.g. `accept_load`)
    - `loadId` (preferred over index), and/or `oneBasedIndex`
    - `summaryText`
    - `createdAt`, `expiresAt`

Redis keys (example):

- `pending_action:{userId}` with TTL (e.g. 3–10 minutes)

## Backend changes (.NET)

- **Add a pending action store**
  - New interface + implementation, e.g. `IPendingActionStore` + `RedisPendingActionStore` using `IConnectionMultiplexer`.
  - Methods:
    - `GetAsync(userId)`
    - `SetAsync(userId, pendingAction, ttl)`
    - `ClearAsync(userId)`
- **Expand OpenAI command schema**
  - Update `OpenAIService.ProcessTranscriptionWithContextAsync` prompt to include:
    - `pending_action` context (if exists)
    - new actions:
      - `search_loads` / `list_loads`
      - `propose_action` (agent proposes, does not execute)
      - `confirm` / `reject`
      - `set_route` / `update_route`
      - `update_cargo_status` (optional)
      - keep `play_music`, `respond`, `other`
  - This likely means changing the prompt format to a more explicit JSON contract, e.g.:
    - `{ "action": "propose_accept_load", "load_index": 2, "message": "..." }`
    - `{ "action": "confirm" }` / `{ "action": "reject" }`
- **Change transcription handling to a 2-step propose/execute**
  - In `RedisListenerService.ProcessTranscriptionAsync`:
    - Before calling OpenAI, load `pending_action:{userId}` and include a short representation in the context passed to the model.
    - When model returns `accept_load` (or `propose_accept_load`):
      - DO NOT send `accept_load` to mobile.
      - Determine the target load (prefer `loadId`):
        - Either from `context.proposed_loads` provided by mobile, or by calling PHP API (see “tools” below).
      - Store `pending_action` in Redis.
      - Send only an `ai_response` asking for confirmation.
    - When model returns `confirm`:
      - Fetch pending action from Redis; if missing/expired, respond with “Nothing to confirm”.
      - Execute the action (call PHP API to accept load / update route).
      - Clear pending action.
      - Send `ai_response` confirming success.
    - When model returns `reject`:
      - Clear pending action.
      - Send `ai_response` offering next option / continue driving.
- **Give the backend real “DB search” tools via PHP API**
  - Implement `IRouteLoadsService` (replace `NoOpRouteLoadsService`) with a real service that calls the PHP endpoints:
    - `GET /v1/driver/route?user_id=...`
    - `GET /v1/driver/loads?user_id=...`
    - `POST /v1/driver/route` (start monitoring)
    - `POST /v1/driver/loads/accept` (accept load)
  - Plumb PHP base URL into .NET config (new `PhpApi:BaseUrl` in `appsettings.json`, env override).
  - Then `RedisListenerService` can:
    - resolve proposed loads server-side (not only from mobile payload)
    - accept by `loadId` deterministically

## Mobile changes

- **Stop executing accepts from AI “commands”**
  - Remove or gate the `accept_load` SignalR handler in `DriveScreen.tsx` so it never directly calls `loadsService.acceptLoad`.
  - The mobile should only show proposals and send voice back; execution happens server-side.
- **UI confirmation (minimal)**
  - Show a small confirmation card/modal when the backend proposes an action.
  - Allow voice (“yes/no”) and taps (“Confirm/Reject/Next/Continue driving”).
  - The tap buttons can publish a short synthetic message into the same pipeline (e.g. publish an `audio_recording`-like message or a new `driver_command` type); if you want minimal changes, keep it voice-only for the first iteration and add taps next.

## Wiring / message contract changes

- Continue using `ai_response` for TTS.
- Optionally add a new message type from .NET to mobile, e.g. `proposal` (structured) so the UI can render a card consistently. (If you skip this, you’ll be parsing plain text, which is brittle.)

## Rollout steps

- Implement server-side pending store + confirm/reject handling first (no UI changes required beyond removing auto-accept), then iterate on richer action schema and proposal UI.

## Test plan (manual)

- Say: “List loads” → app reads proposed loads.
- Say: “Take the Berlin load / accept 2” → backend asks for confirmation (no acceptance happens yet).
- Say: “Yes” → backend calls PHP accept endpoint, then speaks confirmation.
- Say: “No” → backend clears pending, offers alternatives.
- Let pending expire → “Yes” should respond “Nothing to confirm.”

