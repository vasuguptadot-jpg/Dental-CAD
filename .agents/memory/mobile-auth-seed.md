---
name: Mobile Auth Seeding
description: How to create test doctor accounts for the OrthoVision API — no register endpoint exists, must seed directly via psql.
---

# Mobile Auth Seeding

## The rule
The api-server has no doctor registration endpoint. To seed a test account, use psql with a bcrypt hash generated from the workspace node_modules bcryptjs package.

**Why:** The auth route only exposes login/logout/me. There is no admin or signup flow.

## How to apply
1. Generate a bcrypt hash using Node and the bcryptjs package found in `artifacts/api-server/node_modules/bcryptjs`
2. Insert via psql using `$DATABASE_URL` env var: INSERT INTO doctors (name, email, password_hash, role) with ON CONFLICT DO UPDATE

## Cookie auth note
The api-server uses express-session with httpOnly cookies. The Expo web preview shares the same browser session so cookies work automatically. For native (Expo Go), cookie propagation depends on the HTTP stack — works for the web preview, may need a cookie-jar library for production native builds.
