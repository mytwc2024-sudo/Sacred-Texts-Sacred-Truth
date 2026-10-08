# Mother Returns editorial preservation

Private one-way snapshots: existing Notion Mother Returns and Watch the Sky pages into the existing AKST `akst_editorial_sources` registry. Existing dated pack and receipt metadata are retained. No new tables, automatic evidence rulings, work promotion, public release or changes to the curriculum sync endpoint.

Run on an existing trusted server with `NOTION_TOKEN`, `SUPABASE_URL=https://xhzyavyftgyqzftlqdlz.supabase.co` and `SUPABASE_SERVICE_ROLE_KEY` injected through its secret manager. Share both pages with that Notion integration. Never put these credentials in Android/browser clients, chat, source or logs.

```
npx tsx src/notion-sync/editorial-snapshots.ts --dry-run
npx tsx src/notion-sync/editorial-snapshots.ts
npx tsx --test src/notion-sync/editorial-snapshots.test.ts
```

Commands use the existing locked tsx dependency. No schedule is installed by this change. After credential and live write/readback acceptance, an existing host may invoke the command every 15 minutes with overlap prevented. It reads only two allowlisted pages, retrieves pagination/nesting, rejects partial or mid-read changed pages, retains archived/inaccessible prior snapshots, and uses optimistic database concurrency checks. A failed run exits nonzero; retry through the host's bounded retry policy. No content or credential logging.

Scope: block JSON, not durable copies of linked pages or media bytes. Linked pages require separate explicit registration; Notion-hosted file URLs can expire. The original page remains editorial authority. Generated source cards/scripts require their existing review and release gates. Database changes are not reflected back to Notion automatically. This snapshot worker does not update script/evidence rows from edited prose.

Activation criteria: integration can read both pages; dry run passes; live write and full content readback pass; a later Notion edit is observed; unchanged second run is a no-op; permission denial preserves previous content; host scheduling and failure alert are verified. As of implementation, credentials/host execution are not verified and automation is not live.
