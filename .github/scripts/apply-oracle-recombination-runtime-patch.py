from pathlib import Path

path = Path("supabase/functions/oracle-query/index.ts")
source = path.read_text()

if "buildOracleQueryPlanShadowDiagnostics" in source:
    print("Recombination runtime patch already present.")
    raise SystemExit(0)

import_marker = '''import {
  buildShadowRuntimeFailure,
  runAkstLearningQueryPlanShadow,
} from "../_shared/oracle-query-plan-shadow-runtime.ts";
'''
import_replacement = import_marker + '''import { buildOracleQueryPlanShadowDiagnostics } from "../_shared/oracle-query-plan-shadow-diagnostics.ts";
'''
if source.count(import_marker) != 1:
    raise SystemExit("Guard failed: shadow runtime import block changed")
source = source.replace(import_marker, import_replacement, 1)

old = '''diagnostics: {
              ...oracleV1.diagnostics,
              query_plan_shadow: queryPlanShadow,
            },'''
new = '''diagnostics: {
              ...oracleV1.diagnostics,
              ...buildOracleQueryPlanShadowDiagnostics(queryPlanShadow),
            },'''
if source.count(old) != 1:
    raise SystemExit(f"Guard failed: expected one indented shadow diagnostics block, found {source.count(old)}")
source = source.replace(old, new, 1)

old = '''diagnostics: {
            ...oracleV1.diagnostics,
            query_plan_shadow: queryPlanShadow,
          },'''
new = '''diagnostics: {
            ...oracleV1.diagnostics,
            ...buildOracleQueryPlanShadowDiagnostics(queryPlanShadow),
          },'''
if source.count(old) != 1:
    raise SystemExit(f"Guard failed: expected one primary shadow diagnostics block, found {source.count(old)}")
source = source.replace(old, new, 1)

path.write_text(source)
print("Applied guarded Oracle shadow recombination runtime patch.")
