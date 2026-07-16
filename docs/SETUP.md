# AKST setup & runbook

How to connect and run every piece: **Supabase ↔ ingestion ↔ Lovable ↔ Notion**.

---

## 0. One-time: the database

Already deployed to the **EXTRA Ankhor MasterHub** project
(`xhzyavyftgyqzftlqdlz`) from `supabase/migrations/0001_akst_schema.sql`. To
re-apply or deploy to another project, run that file in the Supabase SQL editor.

---

## 1. Run the ingestion pipeline

### Option A — GitHub Actions (recommended; open network egress)

Add three repository secrets: **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Value |
| --- | --- |
| `SUPABASE_URL` | `https://xhzyavyftgyqzftlqdlz.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` (secret) |
| `OPENAI_API_KEY` | Your OpenAI key |

Then **Actions → AKST Ingestion → Run workflow** (optionally set a single title
or tick dry-run). It also runs weekly on its own.

### Option B — locally

```bash
npm install
cp .env.example .env     # fill in the three values above
npm run ingest:dry       # scrape + chunk, no writes
npm run ingest           # full run
```

---

## 2. Populate the knowledge graph (concepts)

After texts are ingested:

```bash
npm run concepts               # extract concepts for texts that lack them
npm run concepts -- --force    # re-extract
```

Needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`.

---

## 3. Wire up the Lovable frontend

Copy the files in `lovable/src/**` into the Lovable project (paths match). In
Lovable:

```bash
npm install @supabase/supabase-js @tanstack/react-query
```

The client uses the **publishable** key (public, RLS-protected). The hooks
(`useTexts`, `useConcepts`, `useAsk`) then read live data. See `lovable/README.md`.

### Ask AKST (semantic Q&A) — deploy the Edge Function

```bash
supabase functions deploy akst-ask --project-ref xhzyavyftgyqzftlqdlz
supabase secrets set OPENAI_API_KEY=sk-... --project-ref xhzyavyftgyqzftlqdlz
```

`useAsk()` calls this function so the OpenAI key never touches the browser.

---

## 4. Mirror the library into Notion

1. Create an integration at <https://www.notion.so/my-integrations> → copy the
   token into `NOTION_TOKEN`.
2. Create a Notion database with these properties, then **share it with the
   integration** and copy its id into `NOTION_TEXTS_DATABASE_ID`:
   `Title` (title), `Author` (text), `Tradition` (select), `Civilization`
   (select), `Language` (text), `Estimated Date` (text), `Word Count` (number),
   `Chunks` (number), `Featured` (checkbox), `Status` (select),
   `Source URL` (url), `Supabase ID` (text).
3. Run:

```bash
npm run sync:notion -- --dry-run   # preview
npm run sync:notion                # mirror Supabase -> Notion (upsert by Source URL)
```

Supabase is the source of truth; the sync is one-way and idempotent.

---

## Security reminders

- The **service-role key** appears only in `.env` / CI secrets and server-side
  code. It must never reach the Lovable frontend (that uses the publishable key).
- Rotate the `sb_secret_…` key that was pasted into the Notion deployment doc,
  and remove it from that page.
- `.env` is gitignored — never commit real secrets.
