# 💸 Nathan Fund

A personal ledger plugin built for the [Operit AI](https://operit.app) platform (ToolPkg architecture). Tracks daily salary accumulation, income, expenses, balance corrections, and wish-list budgeting — all persisted locally as JSON and rendered through a WebView-based UI.

## Features

- **Daily salary accumulation** — automatic balance growth calculated from a configurable start date and daily rate
- **Income / Expense / Penalty tracking** — each transaction gets a unique ID, timestamp, amount, and reason
- **Balance correction** — manual override with audit trail; subsequent calculations resume from the corrected value
- **Pool-based allocation** — when enabled, funds are split into Savings / Treat / Flex pools plus a Bank account with compound interest
- **Wish list** — categorized items with budget ranges, priority, and pool assignment
- **Push notifications** — sends balance updates or reminders to a linked chat session via Operit's messaging API
- **WebView UI** — responsive single-page interface with theme support (mist / dark), served locally through an intercepted virtual URL scheme
- **Message injection** — a companion subpackage (`fund_inject.js`) summarizes current balances into the AI conversation context

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Operit Runtime                         │
│                                                          │
│  ┌──────────┐    hostInterface     ┌──────────────────┐ │
│  │ WebView  │ ◄──────────────────► │ fund_screen.js   │ │
│  │ (UI)     │  FundHost.readData() │ (Controller +    │ │
│  │          │  FundHost.writeData()│  Service layer)  │ │
│  └────┬─────┘                      └────────┬─────────┘ │
│       │                                      │           │
│       │  virtual URL interception             │ file I/O  │
│       ▼                                      ▼           │
│  ┌──────────┐                        ┌──────────────┐   │
│  │ fund.html│                        │  data.json   │   │
│  │ fund-v3  │                        │  (persist)   │   │
│  │ .css/.js │                        └──────────────┘   │
│  └──────────┘                                            │
└─────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Boot** — `fund_screen.js` reads `data.json` from local storage (or initializes defaults), caches it in memory, loads WebView resources.
2. **Render** — Data is injected into the WebView via `evaluateJavascript()` as `window.__FUND_DATA__`; the frontend calls `window.__onFundDataReady__()` to render.
3. **User action** — Frontend calls `FundHost.addPenalty()` / `FundHost.addIncome()` / `FundHost.writeData()` etc. through the JavaScript bridge.
4. **Persist** — Controller validates input, updates the in-memory cache, writes to `data.json`, then pushes refreshed data back to WebView.
5. **Background sync** — A 60-second interval re-pushes data to keep displayed balances current (salary accumulates over time).

## Project Structure

```
├── manifest.json                # Plugin manifest (package ID, version, entry point, resource declarations)
├── dist/
│   ├── main.js                  # Entry: registers the sidebar UI route with Operit
│   └── ui/
│       └── fund_screen.js       # Core logic (409 lines): data CRUD, balance calculation, WebView bridge
├── resources/
│   ├── webview/
│   │   ├── fund.html            # Page skeleton — layout structure, containers, buttons
│   │   ├── fund-v3.css          # Styles — theming, responsive layout, animations
│   │   └── fund-v3.js           # Frontend logic — rendering, user interactions, chart drawing
│   └── fonts/                   # Custom typefaces (not tracked in git due to size)
├── .gitignore
└── README.md
```

## API Reference (hostInterface)

The WebView communicates with the native layer through `FundHost.*` methods exposed via `addJavascriptInterface`:

| Method | Purpose | Parameters | Returns |
|--------|---------|------------|---------|
| `readData()` | Get current fund state | — | `{success, data}` |
| `writeData(json)` | Overwrite entire fund state | Full data object | `{success, balance}` |
| `addPenalty(obj)` | Record a penalty | `{amount, reason?, date?}` | `{success, id}` |
| `addIncome(obj)` | Record income | `{amount, reason?, date?}` | `{success, id}` |
| `addTreat(obj)` | Record an expense | `{amount, reason?, date?}` | `{success, id}` |
| `correctBalance(obj)` | Manual balance override | `{new_balance, reason?}` | `{success, id}` |
| `rebindNotification(obj)` | Re-link push notification target | `{character_name?}` | `{success, queued}` |
| `sendNotification(obj)` | Push a message to linked chat | `{message, settings?}` | `{success, queued}` |
| `pageLog(msg)` | Debug logging from frontend | string | `{success}` |

## Balance Calculation Logic

```javascript
// Simplified pseudocode
if (allocation.enabled) {
  // Pool mode: sum all pool balances + bank total
  balance = bank.total + pools.savings + pools.treat + pools.flex;
} else {
  // Legacy mode: cumulative calculation
  days = daysSince(start_date);
  salary = days * daily_rate;
  balance = salary + penalties + income - expenses + initial_balance;

  // If corrections exist, resume from last correction point
  if (corrections.length > 0) {
    lastCorrection = corrections[last];
    balance = lastCorrection.new_balance
            + salaryAfterCorrection
            + penaltiesAfterCorrection
            + incomeAfterCorrection
            - expensesAfterCorrection;
  }
}
```

This dual-mode approach maintains backward compatibility — older data without allocation pools still calculates correctly, while the pool system provides finer-grained control.

## Data Schema (simplified)

```jsonc
{
  "start_date": "2026-06-29",
  "daily_salary": 5,
  "initial_balance": 0,
  "penalties": [{ "id": "pen_xxx", "amount": 10, "reason": "...", "date": "...", "time": "..." }],
  "income": [{ "id": "inc_xxx", "amount": 50, "reason": "...", "date": "...", "time": "..." }],
  "treats": [{ "id": "tre_xxx", "amount": 25, "reason": "...", "date": "...", "time": "..." }],
  "corrections": [{ "id": "cor_xxx", "old_calculated": 100, "new_balance": 95, "reason": "..." }],
  "allocation": {
    "enabled": true,
    "ratio": { "savings": 30, "treat": 45, "flex": 15, "nathan": 10 },
    "pools": {
      "savings": { "balance": 0, "goal": "...", "goal_amount": 699 },
      "treat": { "balance": 0 },
      "flex": { "balance": 0 }
    },
    "bank": { "total": 0, "naya_custody": 0, "annual_rate": 0.012 }
  },
  "wishes": [{ "title": "...", "budget": 35, "priority": "high", "pool": "treat", "status": "pending" }],
  "notification": { "enabled": true, "character_name": "Nathan", "chat_id": "...", "chat_title": "..." },
  "ui_preferences": { "theme": "mist" }
}
```

## Design Decisions

1. **Single JSON file storage** — No database dependency. The plugin runs entirely on a mobile device with limited resources; a single atomic file write is simpler and more reliable than SQLite for this data volume (~50KB typical).

2. **Correction-based audit trail** — Rather than allowing direct edits to past transactions, balance corrections create a new reference point. All subsequent calculations resume from the last correction, preserving a clear audit history.

3. **Virtual URL interception** — Instead of loading `file://` paths (which have CORS and security restrictions on Android WebView), the plugin registers a fake HTTPS origin (`https://nathanfund.local`) and intercepts all requests to serve local files. This enables full-featured web APIs without cross-origin issues.

4. **Dual calculation modes** — The legacy cumulative mode handles simple use cases; the allocation/pool system handles complex multi-account scenarios. Both coexist in the same codebase with a single `allocation.enabled` flag as the switch.

5. **Push notification integration** — The plugin can send messages to an Operit chat session, enabling automated reminders (e.g., daily balance updates, spending alerts) without requiring the user to open the sidebar.

## Tech Stack

- **Runtime**: Operit AI ToolPkg Runtime (Node.js-style module system on Android)
- **Frontend**: Vanilla HTML + CSS + JavaScript (no framework), rendered in Android WebView
- **Storage**: Local JSON file with atomic writes
- **Bridge**: WebView ↔ Native bidirectional communication via `addJavascriptInterface` + `evaluateJavascript`
- **Language**: JavaScript (ES5-compatible for broad WebView support, with async/await in the native layer)

## Local Development

This plugin requires the Operit AI runtime environment. To preview the frontend independently:

1. Open `resources/webview/fund.html` in a browser
2. The page will render with empty/default data (native bridge calls will fail gracefully)
3. Inject test data via browser console: `window.__onFundDataReady__({...testData})`

## License

Private project. Not for redistribution.
