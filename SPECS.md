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

### 3.1 Live Data Grabber
- **Endpoint**: `GET /api/live`
- **Functionality**:
  - Performs the socket.io handshake to obtain a `sid` from Winamax.
  - Emulates the polling sequence to retrieve market structure (sports, categories, tournaments, filters, bet categories), matches, odds, bets, and outcomes.
  - Stores metadata, matches, bets, and outcomes in the database (upsert).
  - Historizes odds in the `winamax_odds_history` table on a 1-minute basis.
  - Uses object keys from the source as primary keys in the database.

### 3.2 Main Page (Match List)
- **Features**:
  - Displays a list of matches ordered by `match_start` descending.
  - Filtering: Users can filter matches by sport, tournament, or category.
  - Pagination: The list is paginated to handle large numbers of matches.
  - Real-time: List updates when new data is grabbed.

### 3.3 Match Details (Side Panel)
- **Features**:
  - Clicking on a match opens a side panel.
  - Displays a chart showing the evolution of the associated odds over time.
  - Uses data from the `winamax_odds_history` table.

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
  - `updated_at`: Timestamp with timezone

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
