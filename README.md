# SmartERP

A keyboard-friendly billing and inventory MVP inspired by the project brief. It includes customer and supplier ledgers, item masters, sales invoices, purchase entries, stock movement, reports, and printable invoices. The Node.js backend serves the app and saves its shared demo state as JSON.

## Run it

Run `npm start` from this folder, then open `http://localhost:3000`. The browser also keeps a local recovery copy. The first run initializes the backend with the sample data.

## MVP workflows

- Add and edit customer and supplier records, including GSTIN and opening balances.
- Create item masters with SKU, opening quantity, selling price, unit, and GST rate.
- Record customer invoices and supplier purchases. Saving a voucher adjusts stock; sales are blocked when stock is insufficient.
- Search and filter vouchers, ledgers, and stock; print invoices from the voucher list.
- Review sales, purchases, receivables, inventory value, and estimated output GST.
- Use `F8` for a sales voucher, `F9` for a purchase, `Ctrl/⌘ + K` for command search, `Ctrl/⌘ + H` for home, and `?` for the shortcut list.

## Scope

This is an interactive MVP prototype for one company. The backend has no authentication or access controls and stores data in a single JSON file, so deploy it only with sample data for a demonstration. Free web hosting may use ephemeral storage, which can reset on restart or redeploy. It does not include multiple-company access control, statutory GST filing, accounting journal/receipt vouchers, audit logs, or production-grade financial controls. Currency is INR. Sample records are illustrative.

## Deploy

The included `render.yaml` describes a Render web service. Push the project to a Git repository and create a new Blueprint in Render from that repository. The service serves both the front end and `/api/state` backend from one URL. Use only sample data until authentication and persistent database storage have been added.

