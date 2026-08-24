# Daily Log

A minimal, offline-first weekly planner that runs entirely in the browser. All data is saved to localStorage — no accounts, no servers, no tracking.

## Features

- **Daily / Weekly / Monthly views** — switch between layouts depending on how you want to plan
- **10-minute time grid** — visually block out study sessions from 6 AM to midnight
- **Weekly to-do sidebar** — track tasks alongside your schedule
- **Week goals and reviews** — set intentions and reflect at the end of each week
- **Themes** — 6 built-in color themes (Campus Blue, Sakura Pink, Matcha Green, Lavender, Sunset Orange, Monochrome)
- **Import / Export** — back up your data as JSON or export to CSV
- **Print-friendly** — print any view directly from the browser
- **Fully offline** — no internet required after the initial load

## Tech Stack

- React 18 + TypeScript
- Vite
- Tailwind CSS + shadcn/ui
- date-fns

## Make It Your Own

This project is designed to be forked and deployed as a personal tool. Here's how:

### 1. Fork the repository

Click the **Fork** button at the top right of this page.

### 2. Enable GitHub Pages

Go to your fork's **Settings > Pages** and set the source to **GitHub Actions**.

That's it — the included workflow will automatically build and deploy on every push to `main`. Your planner will be live at:

```
https://xultar.github.io/Daily-Log/
```

### 3. (Optional) Rename the repo

If you rename your fork (e.g. to `my-planner`), update the base path in `vite.config.ts`:

```ts
base: "/my-planner/",
```

### Local Development

```sh
git clone https://github.com/xultar/Daily-Log.git
cd Daily-Log
npm install
npm run dev
```

The dev server runs at `http://localhost:8080`.

### Building for Production

```sh
npm run build
```

Output goes to `dist/` — serve it with any static file host.

## Data Storage

All data lives in your browser's localStorage under keys like `planner-2026-W12`. Nothing is sent anywhere. Use the export feature to back up your data or move it between browsers.

## License

MIT
