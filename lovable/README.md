# AKST — Lovable frontend integration

These are **drop-in files for the Lovable (React + Vite + TypeScript) project** —
not part of the ingestion pipeline in this repo's `src/`. Copy them into the
Lovable app under the matching paths:

```
lovable/src/integrations/supabase/client.ts  ->  src/integrations/supabase/client.ts
lovable/src/integrations/supabase/types.ts   ->  src/integrations/supabase/types.ts
lovable/src/hooks/useTexts.ts                ->  src/hooks/useTexts.ts
lovable/src/hooks/useConcepts.ts             ->  src/hooks/useConcepts.ts
lovable/src/hooks/useAsk.ts                  ->  src/hooks/useAsk.ts
```

## Requirements in the Lovable project

```bash
npm install @supabase/supabase-js @tanstack/react-query
```

Wrap the app in a React Query provider (once):

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const queryClient = new QueryClient();
// <QueryClientProvider client={queryClient}> ...app... </QueryClientProvider>
```

## Keys — important

`client.ts` uses the Supabase **publishable** key. That key is designed to be
public and is protected by Row Level Security (the AKST tables only allow
public reads of `is_public = true` rows). **Never** put the service-role key in
the frontend — that key lives only in the ingestion pipeline / CI secrets.

## What the hooks give you

- `useTexts()` / `useText(id)` / `useFeaturedTexts()` — read the library
- `useTextChunks(textId)` — the reader content for a text
- `useConcepts()` / `useConceptNetwork(name)` — knowledge-graph data
- `useAsk()` — semantic Q&A over `akst_search_similar_chunks` (see the note in
  `useAsk.ts` about where the embedding call must happen)
