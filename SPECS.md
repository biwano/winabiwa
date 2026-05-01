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

### Scraper API (`/api/scraper`)

Server routes that drive Winamax ingestion and related database maintenance are grouped under the **`/api/scraper`** path prefix (operational / scheduler-facing).

### 3.1 Market Structure & Live Data Grabber
- **Endpoint**: `GET /api/scraper/scrape`
- **Query Parameters**:
  - `target` (required): determines which Winamax route is fetched.
    - Allowed values: `live` or `calendar`.
    - `target=calendar` sends socket payload `31:42["m",{"route":"calendar:24"}]`.
    - `target=live` sends socket payload `24:42["m",{"route":"live"}]`.
  - `cleanup` (optional): boolean flag (`true` / `false`), default `false`.
    - This parameter is never mandatory.
    - When `cleanup=true`, stale live matches are removed after ingestion.
    - Cleanup behavior only applies to runs where `target=live`.
    - If provided with an invalid boolean value, the endpoint must return a client error response (`400`).
  - Any missing or invalid `target` value must return a client error response (`400`).
- **Functionality**:
  - Performs the socket.io handshake to obtain a `sid` from Winamax.
  - Retrieves the market structure (sports, categories, tournaments, filters, bet categories) and match data.
  - Stores metadata, matches, bets, and outcomes in the database (upsert).
  - Historizes odds in the `winamax_odds_history` table on a 1-minute basis.
  - If `cleanup=true` and `target=live`, after the scraped data has been injected into the database:
    - Delete all existing rows in `winamax_matches` where `status = "LIVE"` and `id` is **not** present in the freshly scraped live match id set.
    - This deletion step runs strictly after ingestion so that currently scraped live matches remain intact.
  - Uses object keys from the source as primary keys in the database.

### 3.2 Data Cleanup
- **Endpoint**: `GET /api/scraper/cleanup`
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
    - Desktop table includes a `Tags` column.
    - The column displays all tag codes linked to the match (for example: `SIEGE`, `TIRED`, `REVERSAL`).
    - Each tag badge uses the same chip styling as today (for example: small, primary subtle variant).
    - On hover over a tag badge, show a tooltip (or equivalent accessible hint) with the tag assignment time from `winamax_match_tags.created_at`, formatted the same way as the `Start Time` column (locale datetime string, consistent with `match_start` rendering).
    - Match list data loading must return `created_at` per tag association (join row), not only fields from `match_tags`, so the UI can show assignment time without an extra round trip.
    - If a match has no tags, the column renders an empty state (`-`).
  - **Mobile Optimization**: On small screens, a dedicated `MatchListMobile` component is used (replacing the table with a list of cards):
    - Renders using `div` and flexbox only (not `UTable`).
    - Each match card displays:
      - First line: Match name and Sport badge.
      - Second line: Start time, score, Status badge, and tag badges when present; tag badges use the same hover tooltip behavior for assignment time as the desktop table where applicable.
  - **Desktop View**: On larger screens, a `MatchTableDesktop` component is used for a standard tabular view.

### 3.3 Match Details (Side Panel)
- **Features**:
  - Clicking on a match opens a side panel.
  - The side panel header shows the match identifier (`matchId`) on the right side of the title in a very small font.
  - The displayed `matchId` is copyable to clipboard from the UI.
  - Displays a link to the match on Winamax (`https://www.winamax.fr/paris-sportifs/match/{id}`) with `target="_blank"`.
  - Displays a chart showing the evolution of the associated odds over time.
  - Under the odds chart, display all involved outcome identifiers with their labels in a small font (for example: `123456789 - Home`, `123456790 - Draw`, `123456791 - Away`).
  - Below the outcome identifiers, list all tags assigned to the match:
    - For each row in `winamax_match_tags`, show the tag **code** (`match_tags.code`) and the assignment **time** (`winamax_match_tags.created_at`).
    - Reuse the same **badge/chip** component and classes as the main list `Tags` column for the tag **code** (`match_tags.code`), and place the formatted **time** beside it on the same row.
    - The time must use the **same datetime formatting** as the main table `Start Time` column (same locale string rules as `match_start`).
    - Order tags by `created_at` ascending (consistent with chart markers).
    - If there are no tags, omit the block or show an empty state consistent with the list (`-`).
  - Uses data from the `winamax_odds_history` table.
  - Displays the match tags on the chart:
    - All tags linked through `winamax_match_tags` must be rendered inside the chart using `VChart` (ECharts) options only.
    - Do not use external HTML/CSS overlays for tag rendering.
    - Tags are rendered from tag `code` values using native chart option primitives (for example: `graphic`, `markPoint`, `markLine`, or equivalent supported option blocks).
    - Tag placement must be driven by each tag's `created_at` timestamp:
      - Each rendered tag marker/label is positioned on the chart time axis at its own `created_at` value.
      - If multiple tags share the same timestamp, all of them must remain visible (for example via stacking/offset strategy).
    - If no tag is linked to the match, no tag-specific chart option is rendered.

### 3.4 Assistant (Automatic Match Tagging)
- **Endpoint**: `GET /api/assistant/run`
- **Query Parameters**:
  - `matchId` (optional): numeric Winamax match identifier.
    - If omitted, the endpoint runs the standard batch flow on eligible live matches.
    - If provided, the endpoint must scope computation to that single match only (no full live batch scan).
    - The targeted match must still satisfy eligibility constraints used by the assistant pipeline (currently live-state processing).
- **Goal**:
  - Analyze all live matches and automatically assign tags when predefined market/score conditions are met.
- **Execution**:
  - The endpoint processes matches where `status = "LIVE"`.
  - When `matchId` is provided, only that match is loaded and analyzed.
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
  - Favorite/outsider determination:
    - The favorite must be determined once per match from the `main_bet_id` outcomes.
    - Compare outcome odds at the timestamp closest to `winamax_matches.match_start`.
    - The outcome with the lowest odd at that reference timestamp is the favorite.
    - The outcome with the highest odd at that reference timestamp is the outsider.
    - Rule analyzers must reuse this precomputed favorite/outsider identity and must not redefine favorite from the latest tick.
  - Rule name: `SIEGE`.
  - Condition:
    - Match score is exactly `0:0`.
    - The favorite's odd has dropped by at least `0.10` (example: `1.70` to `1.60`).
    - The drop happens within less than `5` minutes.
  - Action:
    - Add the `SIEGE` tag to the match.
  - Rule name: `TIRED`.
  - Condition:
    - The match must belong to a sport whose full match duration model is explicitly known by the assistant.
    - The rule applies only after at least `70%` of the modeled match timeline has elapsed.
    - Elapsed ratio is computed from `(now - winamax_matches.match_start) / modeled_total_duration`.
    - If the sport duration model is unknown, the `TIRED` rule must be skipped for that match.
    - Sport duration lookup uses the **exact sport name value** as provided by Winamax (no normalization/fuzzy matching).
    - Initial modeled durations (exact keys):
      - `Football`: `110 minutes` (`90 + 15 + 5`)
      - `Basketball`: `68 minutes` (`48 + 15 + 5`)
      - `Hockey sur glace`: `95 minutes` (`60 + 30 + 5`)
      - `Handball`: `80 minutes` (`60 + 15 + 5`)
      - `Rugby à XV`: `105 minutes` (`80 + 15 + 10`)
      - `Rugby à XIII`: `100 minutes` (`80 + 10 + 10`)
      - `Football américain`: `90 minutes` (`60 + 20 + 10`)
      - `Futsal`: `60 minutes` (`40 + 15 + 5`)
    - The outsider's odd drops by at least `8%`.
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
    - The summary must indicate whether execution was scoped (`matchId` mode) or global batch mode.

#### Reset (remove all match–tag links)
- **Endpoint**: `GET /api/assistant/reset`
- **Functionality**:
  - Deletes every row from `winamax_match_tags` so no match retains an assigned tag.
  - Does not delete rows from `match_tags` (tag definitions / catalog remain available for future runs of `GET /api/assistant/run`).
- **Response**:
  - Returns a short JSON summary suitable for manual invocation or jobs (for example: number of rows deleted, or counts before/after).

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
