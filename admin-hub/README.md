# Admin Hub

Add an admin section to this app, using the same design system and colors as the existing public pages (do not change the public homepage or post detail page).

ROUTES TO ADD:

/admin

Dashboard page with:

- 4 summary stat cards at the top: Total Categories, Total Locations, Total Scraped Posts, Total Search Requests

- Below that, a table of the 10 most recent search requests showing: category, location, status (Pending / Running / Completed / Failed), created date

- Status should show as a colored badge (gray for pending, blue for running, green for completed, red for failed)

/admin/listings

Table view of all scraped posts with these columns: thumbnail image, caption (truncated to ~60 characters), price, phone number, owner username, likes count, date scraped

- Add a search input at the top that filters by caption or owner username

- Add a delete button/icon on each row (with a confirmation prompt before deleting)

- Paginate the table, 20 rows per page

/admin/settings

Two sections on one page:

1. Categories manager — a list of existing categories, each with a delete button, and a small form at the top to add a new category (name input + Add button)

2. Locations manager — same pattern: list with delete buttons, and a form to add a new location (name input + Add button)

NAVIGATION:

Add a left sidebar, visible only on /admin and its sub-routes, with:

- App name/logo at the top

- Nav links: Dashboard, Listings, Finder

- A divider, then a "Back to site" link that goes to the public homepage

- Highlight the currently active link

No authentication or login required — the admin section should be directly accessible.

DATA:

Use the same mock/placeholder data structure and shape as the public pages already use (categories, locations, posts) — I will connect real backend API endpoints myself afterward. Structure all data fetching in separate files (e.g. adminApi.ts) so it's easy for me to swap mock functions for real API calls later.

Keep everything responsive and consistent with the existing visual style — same fonts, colors, spacing, and card style already used on the public pages.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://insight-panel-light.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/02c20a55-72d3-4c1c-a6e3-ca2f40bbd763).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
