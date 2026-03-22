# Specifications: Entry scanner

## 1. Project Overview

Winabiwa is a web-based application that monitors match ratings by querying the https://www.winamax.fr website. It includes a snapshot system to scrape and store market metadata (sports, categories, tournaments) for analysis.

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

### 3.1 Snapshot System
- **Endpoint**: `GET /api/snapshot/calendar`
- **Functionality**:
  - Queries `https://www.winamax.fr/paris-sportifs/calendar`.
  - Extracts the `PRELOADED_STATE` variable from the HTML.
  - Parses and stores the data into structured tables (`winamax_sports`, `winamax_categories`, `winamax_tournaments`, `winamax_bet_filters`, `winamax_bet_categories`).
  - Uses object keys from the source as primary keys in the database.

## 4. Database Schema

### 4.1 Winamax Metadata Tables

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
