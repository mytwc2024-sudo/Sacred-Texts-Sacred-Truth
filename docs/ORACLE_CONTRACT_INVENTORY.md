# AKST Oracle — Stage 2.0-D Contract Inventory

**Status:** reconciled contract inventory  
**Production mutation:** none  
**Purpose:** identify the contracts that Stage 2.1 must unify without breaking the live Ask surface.

---

## 1. Finding

AKST currently has **four overlapping Ask/Oracle contracts**, not one:

1. `akst-ask` — canonical-backend legacy Ask implementation; not observed in the live Edge Function inventory.
2. `ask-akst` — live product Ask endpoint used by `app-forge-studio-78/main/src/pages/Ask.tsx`.
3. `oracle-query` — richer internal three-well Oracle retrieval/synthesis core.
4. `oracle-client` — Luminaria/client-facing adapter with voice support and its own retrieval summary contract.

The core problem for Stage 2.1 is therefore **contract convergence**, not lack of retrieval capability.

---

## 2. Contract matrix

| Contract | Primary caller / role | Request | Response | Retrieval authority | Current disposition |
|---|---|---|---|---|---|
| `akst-ask` | legacy embedded Lovable hook in canonical backend | `question` | `answer`, `sources` | `akst_search_similar_chunks`; 1536 OpenAI embedding | compatibility-only candidate |
| `ask-akst` | live AKST product Ask page | `question`, optional `history`, `learning_context`, `learning_mode`, `learning_instruction` | `answer`, `sources`, `evidence_state`, `retrieval`, learning metadata | rights-gated `match_chunks`; 1536 OpenAI embedding | live compatibility gateway |
| `oracle-query` | internal/Ankhor/Luminaria Oracle core | `question`, `surface` | `answer`, `answer_mode`, `generation_provider`, `evidence_state`, per-well evidence, `citations`, `laws_applied`, `retrieval` | three-well retrieval; native GTE-384 vector + lexical fallback; standpoint/tier gates | **canonical core candidate** |
| `oracle-client` | client-facing/Luminaria adapter | `question`, optional `speak`; `mode=health`; client ID header | `answer`, `answer_mode`, `generation_provider`, `evidence_state`, `citations`, per-well status summary, `laws_applied`, `voice`, optional audio | mixed older client-safe lane + voice quota | adapter candidate; must delegate to canonical core |

---

## 3. `akst-ask` — legacy backend contract

### Request

```json
{
  "question": "string"
}
```

### Success response

```json
{
  "answer": "string",
  "sources": []
}
```

### Failure / no-match behavior

- 400: invalid/missing `question`
- 500: thrown provider/RPC error
- no match: returns an `answer` string plus empty `sources`

### Retrieval behavior

- OpenAI `text-embedding-3-small` (1536)
- `akst_search_similar_chunks`
- threshold `0.5`
- match count `5`
- synthesis restricted to returned passages

### Missing contract domains

- no explicit evidence state
- no retrieval metadata
- no normalized citation objects
- no well/source class
- no degradation state
- no claim-support representation
- no contradiction representation

### Stage 2.1 disposition

Do not make this the new Oracle core. If retained, it should become a compatibility alias/adapter that emits the unified contract or a deliberately reduced compatibility projection.

---

## 4. `ask-akst` — live AKST product contract

### Request

Required:

```json
{
  "question": "string"
}
```

Optional learning fields:

- `history` — recent conversational turns
- `learning_context`
- `learning_mode` — `explain | discuss | quiz`
- `learning_instruction`

### Grounded success response

```json
{
  "answer": "string",
  "sources": [],
  "evidence_state": "grounded",
  "retrieval": "match_chunks/akst_publishable_chunks",
  "learning_mode": "...",
  "learning_context": "..."
}
```

### Insufficient-evidence response

```json
{
  "answer": "...gap stated explicitly...",
  "sources": [],
  "evidence_state": "insufficient",
  "retrieval": "match_chunks/akst_publishable_chunks"
}
```

### Source object currently includes

- chunk/text IDs
- title
- author / translator
- excerpt
- chapter / section / verse
- source name / URL
- rights status
- content tier
- similarity
- source table label

### Retrieval behavior

- OpenAI `text-embedding-3-small` (1536)
- service-role rights-gated RPC `match_chunks`
- threshold `0.35`
- match count `8`
- sources originate from `akst_publishable_chunks`

### Strengths worth preserving

- explicit `evidence_state`
- source rights/provenance fields
- learning modes/context
- explicit refusal to fabricate when evidence is absent

### Stage 2.1 disposition

Keep the live endpoint name during migration, but make it a compatibility gateway into the canonical Oracle core rather than a second retrieval implementation.

---

## 5. `oracle-query` — three-well core contract

### Request

```json
{
  "question": "string",
  "surface": "internal | ankhor_internal | luminaria_client"
}
```

Authentication is a custom Oracle transport secret retrieved/validated against Supabase Vault. Runtime `verify_jwt=false` does not mean unauthenticated execution.

### Success / partial response domains

```text
question
surface
answer
answer_mode
generation_provider
evidence_state
grimoire
akst
sacred_writings
citations
laws_applied
retrieval
```

### Evidence state

- `three_well`
- `partial`
- `insufficient`

### Citation object

Current labels encode well identity:

- `G#` — Grimoire/correspondence
- `A#` — ancient Tier A
- `S#` — Sacred Writings

Current citation metadata includes varying combinations of title, URL, section heading, tier, and standpoint.

### Retrieval behavior

**Well 1 — Grimoire**

- `search_oracle_correspondences`
- `client_safe=true` for `luminaria_client`

**Well 2 — ancient corpus**

- native GTE-small 384 embedding generated once per query
- `match_ancient_chunks_gte`
- threshold `0.30`
- lexical fallback via `search_oracle_ancient_lexical`
- Tier A only

**Well 3 — Sacred Writings**

- same native query embedding
- `match_sacred_writings_gte`
- threshold `0.30`
- lexical fallback via `search_sacred_writings_lexical`
- standpoint-gated
- Tier B excluded for `luminaria_client`

### Strongest Stage 2.1 foundation

`oracle-query` is the closest existing implementation to a canonical evidence core because it already carries:

- multi-well retrieval
- explicit surface policy
- evidence state
- provenance-sensitive citation classes
- native embedding metadata
- lexical fallback
- refusal/gap behavior
- laws/policy metadata

### Gaps remaining

- citations are still answer-level, not claim-level
- no normalized `evidence_units[]` schema
- confidence/score semantics vary by retrieval method
- no contradiction set
- no gap-memory object
- no trace ID / query decomposition object
- no stable contract version

---

## 6. `oracle-client` — Luminaria/client adapter contract

### Request

Normal query:

```json
{
  "question": "string",
  "speak": true
}
```

Health:

```json
{
  "mode": "health"
}
```

Optional caller identity is carried in `x-oracle-client-id` for voice quota hashing.

### Response domains

```text
answer
answer_mode
generation_provider
evidence_state
citations
wells
laws_applied
voice
optional audio_base64
optional audio_content_type
```

### Current architectural issue

`oracle-client` is not merely a presentation adapter today. It duplicates retrieval decisions:

- Grimoire RPC
- ancient vector/lexical selection
- Sacred Writings lookup
- evidence-state calculation
- synthesis fallback

It also uses an older retrieval mix than `oracle-query` in places. That makes it a second answer authority in practice.

### Stage 2.1 disposition

Keep client-safe policy, health, quota, and voice behavior, but remove duplicated evidence authority over time. The target shape is:

```text
client request
  -> canonical Oracle query contract
  -> client-safe projection / voice rendering
```

Voice remains presentation, never evidence.

---

## 7. Canonical Stage 2.1 envelope — required domains

The unified contract should be versioned and should separate answer synthesis from evidence truth.

Minimum target:

```ts
interface OracleResponseV1 {
  contract_version: "oracle.v1";
  query: {
    original: string;
    normalized?: string;
    surface: "internal" | "ankhor_internal" | "akst_learning" | "luminaria_client";
  };
  state: "grounded" | "partial" | "insufficient" | "degraded";
  answer: string;
  answer_mode: "generated_grounded" | "evidence_only";
  evidence_units: OracleEvidenceUnit[];
  citations: OracleCitation[];
  retrieval: {
    methods: string[];
    wells_queried: string[];
    wells_returned: string[];
    degraded_reasons: string[];
  };
  policy: {
    laws_applied: string[];
    surface_restrictions: string[];
  };
  diagnostics?: {
    trace_id?: string;
    generation_provider?: string;
  };
}
```

Future stages may extend this with claim-level support, contradictions, chronology, identity resolution, and persistent gap memory. Those should extend the evidence model rather than mutate ad hoc endpoint-specific payloads.

---

## 8. Compatibility migration rule

Stage 2.1 should not break the live `Ask.tsx` consumer.

Preferred migration sequence:

1. define and test `oracle.v1` internally;
2. make `oracle-query` emit it;
3. make `ask-akst` delegate to the canonical core while preserving the fields the current Ask page expects;
4. make `oracle-client` delegate to the same core and perform only client-safe projection/voice work;
5. either retire `akst-ask` or convert it to a compatibility alias after caller verification;
6. only then update frontend callers to consume the richer contract directly.

No endpoint rename is required to achieve one Oracle.

---

## 9. Stage 2.0-D disposition

**Contract inventory:** complete  
**Canonical core candidate:** `oracle-query`  
**Live compatibility gateway:** `ask-akst`  
**Client adapter candidate:** `oracle-client`  
**Legacy compatibility candidate:** `akst-ask`  
**Next gate:** Stage 2.0-E closeout, then Stage 2.1 implementation on the same isolated branch.
