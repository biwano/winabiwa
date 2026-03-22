# Specifications: Entry scanner

## 1. Project Overview

Winabiwa is a web-based application that monitors match ratings by querying the https://www.winamax.fr website

## 2. Technical Stack

- **Frontend**: Nuxt 4 (Vue.js) with Nuxt UI (using a **Fuchsia** primary theme and Tailwind CSS).
- **Database/Backend**: Supabase (PostgreSQL for storage, Supabase Auth for users).
- **Authentication UI**: `@supa-kit/auth-ui-vue` for managing the login and registration flows.
- **Architecture (Feature-Slice Design)**:
  - **Pages (`/app/pages`)**: Orchestrate the layout and combine multiple features to form a complete view. Pages handle routing and high-level data orchestration.
  - **Features (`/app/features`)**: Small, focused, and self-contained units of functionality. A feature is a granular piece of the UI and logic
- **Relative Time**: Use `dayjs` for date manipulation and relative time formatting across the application.
- **Package Manager**: pnpm
