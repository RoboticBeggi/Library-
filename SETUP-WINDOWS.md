# Textbook Returns: put it online with Cloudflare (Windows)

You need: a free Cloudflare account, about 30 minutes, and internet.

## 1. Install the tools (once)
1. Install **Node.js LTS** from https://nodejs.org (click the big LTS button, then Next, Next, Finish).
2. Install **VS Code** from https://code.visualstudio.com
3. Unzip this folder somewhere easy, for example `Documents\textbook-returns`.
4. Open VS Code, choose **File > Open Folder**, and pick that folder.
5. Open the terminal in VS Code: **Terminal > New Terminal**.

Check it worked: type `node -v` and press Enter. You should see a version number like `v22...`.

## 2. Download the parts the site needs
In the VS Code terminal:
```
npm install
```
Wait until it finishes (1 to 3 minutes).

## 3. Sign in to Cloudflare
```
npx wrangler login
```
A browser window opens. Click **Allow**.

## 4. Create the database
```
npm run db:create
```
It prints a block that contains a line like:
`"database_id": "1a2b3c4d-...."`
Copy that long id. Open `wrangler.jsonc` in VS Code and replace the zeros in `"database_id"` with it. Save (Ctrl+S).

## 5. Create the tables and starter accounts
```
npm run db:migrate
```
Type `y` if it asks to continue.

## 6. Put the site online
```
npm run deploy
```
At the end it prints your link, for example `https://textbook-returns.yourname.workers.dev`. That is your site, with no badge.

## 7. Sign in
- Admin: username `admin`
- Test librarian: username `tester`
Use the temporary passwords you were given. Each account must pick its own password at first sign-in.

## Updating the site later
After any change to the code, run `npm run deploy` again.
If a change adds a new file in `migrations/`, run `npm run db:migrate` first.

## Own domain (optional)
In the Cloudflare dashboard: **Workers & Pages > textbook-returns > Settings > Domains & Routes > Add > Custom domain**.

## If something goes wrong
- `'npm' is not recognized`: close VS Code, reopen it, and try again (Node.js needs a fresh terminal).
- `Authentication error`: run `npx wrangler login` again.
- Site says "Database is not available": check the `database_id` in `wrangler.jsonc`, then run `npm run deploy` again.
