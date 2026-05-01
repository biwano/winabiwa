# Specifications: Entry scanner

## 1. Project Overview

Winabiwa is a web-based application that monitors match ratings by querying the https://www.winamax.fr website. It includes a live data grabber system to scrape and store market metadata (sports, categories, tournaments) and odds for analysis.

## 2. Technical Stack

- **Frontend**: Nuxt 4 (Vue.js) with Nuxt UI (using a **Fuchsia** primary theme and Tailwind CSS).
- **Database/Backend**: Supabase (PostgreSQL for storage, Supabase Auth for users).
- **API Routes**: Nuxt Server Routes (`/server/api`).
- **Scraping**: `fetch` or `cheerio` for extracting data from Winamax.
- **Authentication UI**: `@supa-kit/auth-ui-vue` for managing the login and registration flows.
- **Architecture (Feature-Slice Design)**:
  - **Pages (`/app/pages`)**: Orchestrate the layout and combine multiple features to form a complete view. Pages handle routing and high-level data orchestration.
  - **Features (`/app/features`)**: Small, focused, and self-contained units of functionality. A feature is a granular piece of the UI and logic
- **Relative Time**: Use `dayjs` for date manipulation and relative time formatting across the application.
- **Package Manager**: pnpm

## 3. Core Features

### 3.1 Market Structure & Live Data Grabber
- **Endpoint**: `GET /api/live`
- **Query Parameters**:
  - `target` (required): determines which Winamax route is fetched.
    - Allowed values: `live` or `calendar`.
    - `target=calendar` sends socket payload `31:42["m",{"route":"calendar:24"}]`.
    - `target=live` sends socket payload `24:42["m",{"route":"live"}]`.
  - Any missing or invalid `target` value must return a client error response (`400`).
- **Functionality**:
  - Performs the socket.io handshake to obtain a `sid` from Winamax.
  - Retrieves the market structure (sports, categories, tournaments, filters, bet categories) and match data.
  - Stores metadata, matches, bets, and outcomes in the database (upsert).
  - Historizes odds in the `winamax_odds_history` table on a 1-minute basis.
  - Uses object keys from the source as primary keys in the database.

### 3.2 Data Cleanup
- **Endpoint**: `GET /api/cleanup`
- **Functionality**:
  - Deletes matches from `winamax_matches` that started more than 3 hours ago.
  - Relies on database-level `ON DELETE CASCADE` to remove associated bets, outcomes, and odds history.

### 3.3 Main Page (Match List)
- **Features**:
  - Displays a list of matches ordered by `match_start` descending.
  - Filtering: Users can filter matches by sport, tournament, or category.
  - Live Filtering: A toggle to show only live matches (`status = "LIVE"`).
    - This filter is disabled by default.
    - When enabled, only matches currently in live state are displayed.
  - Tagged Filtering: A toggle to show only matches that have at least one tag in `winamax_match_tags`.
    - This filter is disabled by default.
    - When enabled, only matches linked to one or more entries in `match_tags` are displayed.
  - Outcome Filtering: A toggle to show only matches that have at least one outcome. This filter is enabled by default.
  - Starting Soon Filtering: A toggle labeled `Show only matches that start soon`.
    - This filter is enabled by default.
    - When enabled, only matches whose `match_start` is less than or equal to the current time plus `1 hour` are displayed.
    - This includes matches that already started and matches that will start within the next hour.
  - URL Synchronization: All filters (sport, category, tournament, search, live toggle, tagged toggle, outcome toggle, starting soon toggle) and pagination are bidirectionally synchronized with URL query parameters.
  - Pagination: The list is paginated to handle large numbers of matches.
  - Real-time: List updates when new data is grabbed.
  - Desktop Table Columns (ordered):
    - `Match`
    - `Sport`
    - `Score`
    - `Start Time`
    - `Status`
    - `Tags`
  - Tags Column:
    - Desktop table includes a `Tags` column positioned immediately after `Status`.
    - The column displays all tag codes linked to the match (for example: `SIEGE`, `TIRED`, `REVERSAL`).
    - If a match has no tags, the column renders an empty state (`-`).
  - **Mobile Optimization**: On small screens, a dedicated `MatchListMobile` component is used (replacing the table with a list of cards):
    - Renders using `div` and flexbox only (not `UTable`).
    - Each match card displays:
      - First line: Match name and Sport badge.
      - Second line: Start time, score, and Status badge.
  - **Desktop View**: On larger screens, a `MatchTableDesktop` component is used for a standard tabular view.

### 3.3 Match Details (Side Panel)
- **Features**:
  - Clicking on a match opens a side panel.
  - Displays a link to the match on Winamax (`https://www.winamax.fr/paris-sportifs/match/{id}`) with `target="_blank"`.
  - Displays a chart showing the evolution of the associated odds over time.
  - Uses data from the `winamax_odds_history` table.

### 3.4 Assistant (Automatic Match Tagging)
- **Endpoint**: `GET /api/assistant/run`
- **Goal**:
  - Analyze all live matches and automatically assign tags when predefined market/score conditions are met.
- **Execution**:
  - The endpoint processes matches where `status = "LIVE"`.
  - The endpoint is designed to be manually triggerable and scheduler-compatible (cron/job runner).
- **Rule-Independent Analysis Pipeline (target refactor)**:
  - The assistant route must have a dedicated, reusable data-loading layer independent from any single rule.
  - The data-loading layer is responsible for:
    - Fetching live matches.
    - Fetching related markets/outcomes for each live match.
    - Fetching odds history windows needed by rules.
    - Building normalized in-memory structures (by match, by bet, by outcome) consumed by analyzers.
  - Rule analyzers must not query Supabase directly; they only receive prepared data context and return tag decisions.
  - Tag persistence (upsert in `winamax_match_tags`) remains centralized after all rule analyzers run.
- **Rule Set (v1 + v2 + v3)**:
  - Rule name: `SIEGE`.
  - Condition:
    - Match score is exactly `0:0`.
    - The favorite's odd has dropped by at least `0.10` (example: `1.70` to `1.60`).
    - The drop happens within less than `5` minutes.
  - Action:
    - Add the `SIEGE` tag to the match.
  - Rule name: `TIRED`.
  - Condition:
    - The outsider's odd drops by more than `8%`.
    - The drop occurs within less than `10` minutes.
    - Percent drop formula: `(older_odd - latest_odd) / older_odd`.
  - Action:
    - Add the `TIRED` tag to the match.
  - Rule name: `REVERSAL`.
  - Condition:
    - The current score indicates that the favorite is losing the match.
    - The favorite's latest odd remains under `2.5`.
  - Action:
    - Add the `REVERSAL` tag to the match.
- **Idempotency**:
  - A match can have multiple tags.
  - The same tag must not be duplicated for the same match.
- **Observability**:
  - The endpoint returns a summary including:
    - Number of live matches analyzed.
    - Number of matches tagged (global).
    - Number of matches tagged per rule (`SIEGE`, `TIRED`, `REVERSAL`, ...).
    - Number of tags created (or already existing/no-op).

## 4. Database Schema

### 4.1 Winamax Metadata Tables
...
- **`winamax_matches`**:
  - `id`: BigInt (Primary Key)
  - `sport_id`: BigInt (Foreign Key to `winamax_sports`)
  - `category_id`: BigInt (Foreign Key to `winamax_categories`)
  - `tournament_id`: BigInt (Foreign Key to `winamax_tournaments`)
  - `title`: Text
  - `status`: Text
  - `match_start`: Timestamp with timezone
  - `competitor1_id`: BigInt
  - `competitor1_name`: Text
  - `competitor2_id`: BigInt
  - `competitor2_name`: Text
  - `main_bet_id`: BigInt (Nullable)
  - `score`: Text (Nullable, expected format such as `0-0`)
  - `updated_at`: Timestamp with timezone

- **`match_tags`**:
  - `id`: BigInt (Primary Key, generated identity)
  - `code`: Text (Unique, example: `SIEGE`)
  - `label`: Text (Human-readable name)
  - `description`: Text (Nullable)
  - `created_at`: Timestamp with timezone
  - `updated_at`: Timestamp with timezone

- **`winamax_match_tags`** (join table, many-to-many):
  - `match_id`: BigInt (Primary Key, Foreign Key to `winamax_matches`)
  - `tag_id`: BigInt (Primary Key, Foreign Key to `match_tags`)
  - `created_at`: Timestamp with timezone

- **`winamax_bets`**:
  - `id`: BigInt (Primary Key)
  - `match_id`: BigInt (Foreign Key to `winamax_matches`)
  - `title`: Text
  - `bet_type_category_id`: BigInt (Foreign Key to `winamax_bet_categories`)
  - `market_id`: BigInt (Nullable)
  - `updated_at`: Timestamp with timezone

- **`winamax_outcomes`**:
  - `id`: BigInt (Primary Key)
  - `bet_id`: BigInt (Foreign Key to `winamax_bets`)
  - `label`: Text
  - `code`: Text (Nullable)
  - `updated_at`: Timestamp with timezone

- **`winamax_odds_history`**:
  - `outcome_id`: BigInt (Primary Key, Foreign Key to `winamax_outcomes`)
  - `timestamp`: Timestamp with timezone (Primary Key, rounded to 1-minute)
  - `value`: Numeric

- **`winamax_sports`**:
  - `id`: BigInt (Primary Key)
  - `name`: Text
  - `updated_at`: Timestamp with timezone

- **`winamax_categories`**:
  - `id`: BigInt (Primary Key)
  - `name`: Text
  - `flag`: Text (Nullable)
  - `sport_id`: BigInt (Foreign Key to `winamax_sports`)
  - `updated_at`: Timestamp with timezone

- **`winamax_tournaments`**:
  - `id`: BigInt (Primary Key)
  - `name`: Text
  - `category_id`: BigInt (Foreign Key to `winamax_categories`)
  - `sr_tournament_id`: Text (Nullable)
  - `sr_season_id`: Text (Nullable)
  - `updated_at`: Timestamp with timezone

- **`winamax_bet_filters`**:
  - `id`: BigInt (Primary Key)
  - `name`: Text
  - `parent_id`: BigInt (Self-reference, Nullable)
  - `is_default`: Boolean
  - `display_order`: Integer
  - `updated_at`: Timestamp with timezone

- **`winamax_bet_categories`**:
  - `id`: BigInt (Primary Key)
  - `name`: Text
  - `display_order`: Integer
  - `updated_at`: Timestamp with timezone

## 5. Security (RLS)

### 5.1 Winamax Data
All data stored in Winamax-related tables (`winamax_*`) is publicly readable (accessible to everyone, including unauthenticated users). Write access is restricted to the server-side role.

### 5.2 User Data
Standard Supabase user-level access controls apply to user profiles and preferences.
