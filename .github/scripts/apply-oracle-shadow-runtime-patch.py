from pathlib import Path

path = Path("supabase/functions/oracle-query/index.ts")
source = path.read_text()

if "shadow_query_plan" in source:
    print("Shadow runtime patch already present.")
    raise SystemExit(0)

replacements = [
    (
        '} from "../_shared/oracle-contract.ts";\n\nconst CORS',
        '} from "../_shared/oracle-contract.ts";\nimport {\n  buildShadowRuntimeFailure,\n  runAkstLearningQueryPlanShadow,\n} from "../_shared/oracle-query-plan-shadow-runtime.ts";\n\nconst CORS',
    ),
    (
        '    const forceEvidenceOnly = body?.evidence_only === true;\n\n    if (!question)',
        '    const forceEvidenceOnly = body?.evidence_only === true;\n    const runShadowQueryPlan = body?.shadow_query_plan === true;\n\n    if (!question)',
    ),
    (
        '        traceId,\n        wellsQueried,\n      });\n\n      return json({',
        '        traceId,\n        wellsQueried,\n      });\n      const queryPlanShadow = runShadowQueryPlan\n        ? await executeQueryPlanShadow(db, oracleV1.query_plan)\n        : undefined;\n\n      return json({',
    ),
    (
        '        laws_applied: lawsApplied,\n        ...oracleV1,\n      });',
        '        laws_applied: lawsApplied,\n        ...oracleV1,\n        ...(queryPlanShadow\n          ? {\n            diagnostics: {\n              ...oracleV1.diagnostics,\n              query_plan_shadow: queryPlanShadow,\n            },\n          }\n          : {}),\n      });',
    ),
    (
        '      traceId,\n      wellsQueried,\n    });\n\n    return json({',
        '      traceId,\n      wellsQueried,\n    });\n    const queryPlanShadow = runShadowQueryPlan\n      ? await executeQueryPlanShadow(db, oracleV1.query_plan)\n      : undefined;\n\n    return json({',
    ),
    (
        '      laws_applied: lawsApplied,\n      ...oracleV1,\n    });',
        '      laws_applied: lawsApplied,\n      ...oracleV1,\n      ...(queryPlanShadow\n        ? {\n          diagnostics: {\n            ...oracleV1.diagnostics,\n            query_plan_shadow: queryPlanShadow,\n          },\n        }\n        : {}),\n    });',
    ),
]

for old, new in replacements:
    count = source.count(old)
    if count != 1:
        raise SystemExit(
            f"Guard failed: expected one source match, found {count}: {old[:80]!r}"
        )
    source = source.replace(old, new, 1)

marker = "\nasync function authenticateTransport(\n"
if source.count(marker) != 1:
    raise SystemExit("Guard failed: authenticateTransport insertion point changed")

helper = r'''
async function executeQueryPlanShadow(
  db: ReturnType<typeof createClient>,
  plan: Parameters<typeof runAkstLearningQueryPlanShadow>[0],
) {
  try {
    return await runAkstLearningQueryPlanShadow(plan, {
      retrieveAncient: async (question) => {
        const embedding = await nativeEmbed(question);
        return await getAncient(db, question, embedding);
      },
      loadSourceMetadata: async (textIds) => {
        const { data, error } = await db
          .from("akst_texts")
          .select(
            "id,title,tradition_id,estimated_date,original_language,translator,source_name,source_url,source_file_name,source_format,source_acquired_at,work_key,witness_key,verification_status,rights_status,content_tier,is_public",
          )
          .in("id", textIds)
          .eq("is_public", true)
          .eq("content_tier", "A")
          .in("rights_status", ["public_domain", "rights_cleared"]);

        if (error) {
          throw new Error("shadow source metadata lookup failed");
        }
        return data ?? [];
      },
    });
  } catch (error) {
    console.error("Oracle query-plan shadow", error);
    return buildShadowRuntimeFailure(plan);
  }
}
'''

source = source.replace(marker, "\n" + helper + marker, 1)
path.write_text(source)
print("Applied guarded Oracle shadow-runtime patch.")
