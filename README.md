# SmartERP

A keyboard-friendly billing and inventory MVP with account creation, sign-in, sign-out, customer and supplier ledgers, item masters, sales invoices, purchase entries, stock movement, reports, and printable invoices. The Node.js backend stores salted password hashes and keeps each account's workspace separate.

## Run it

Run `npm install` and then `npm start` from this folder. Open `http://localhost:3000`. Without `DATABASE_URL`, local development stores demo accounts and workspaces in the ignored `data/` folder. On Render, the Blueprint connects a free Postgres database.

## MVP workflows

- Create an account with your name, email, and a password of at least 8 characters; sign in and sign out.
- Add and edit customer and supplier records, including GSTIN and opening balances.
- Create item masters with SKU, opening quantity, selling price, unit, and GST rate.
- Record customer invoices and supplier purchases. Saving a voucher adjusts stock; sales are blocked when stock is insufficient.
- Search and filter vouchers, ledgers, and stock; print invoices from the voucher list.
- Review sales, purchases, receivables, inventory value, and estimated output GST.
- Use `F8` for a sales voucher, `F9` for a purchase, `Ctrl/⌘ + K` for command search, `Ctrl/⌘ + H` for home, and `?` for the shortcut list.

## Scope and data

This is an interactive MVP prototype, not production accounting software. Passwords are stored as salted scrypt hashes. Sessions use HttpOnly, SameSite cookies and are held in memory, so signing in again may be required after the server restarts. The Render Blueprint uses a free Postgres database for separate accounts and workspaces; Render's free Postgres expires after 30 days. Use sample data only. The app does not include email verification, password reset, multi-factor authentication, statutory GST filing, audit logs, or production-grade financial controls. Currency is INR. Sample records are illustrative.

## Deploy

The included `render.yaml` describes the Render web service and its free Postgres database. Create or sync the Render Blueprint from this repository. The service serves both the front end and `/api` backend from one URL.
