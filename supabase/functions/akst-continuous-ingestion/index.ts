import postgres from "npm:postgres@3.4.4";
const DB=Deno.env.get("SUPABASE_DB_URL")!;
function reply(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}})}
function safeEqual(a:string,b:string){if(!a||!b||a.length!==b.length)return false;let m=0;for(let i=0;i<a.length;i++)m|=a.charCodeAt(i)^b.charCodeAt(i);return m===0}
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return reply({error:"POST required"},405);
 const sql=postgres(DB,{prepare:true,max:1,idle_timeout:5,connect_timeout:10});
 try{
  const secrets=await sql<{secret:string}[]>`select decrypted_secret as secret from vault.decrypted_secrets where name='oracle_transport_token' limit 1`;
  const secret=secrets[0]?.secret??"";
  if(!safeEqual(req.headers.get("x-oracle-transport-secret")??"",secret))return reply({error:"Unauthorized transport"},401);
  const reconciled=await sql`select count(*)::int as count from akst_internal.reconcile_ingestion_registry()`;
  const summary=await sql`select state,handler_key,count(*)::int as count from public.akst_ingestion_jobs group by state,handler_key order by state,handler_key`;
  const due=await sql`select count(*)::int as count from public.akst_ingestion_jobs j join public.akst_ingestion_handlers h on h.handler_key=j.handler_key and h.enabled where j.state in ('ready','retry_wait') and j.next_attempt_at<=now()`;
  return reply({ok:true,reconciled:Number(reconciled[0]?.count??0),dispatchable:Number(due[0]?.count??0),summary,boundary:"machine fetches, verifies, enters, matches, and flags; adjudication remains human",note:"Only enabled, acceptance-tested handlers may dispatch."});
 }catch(error){return reply({ok:false,error:error instanceof Error?error.message:String(error)},500)}
 finally{await sql.end({timeout:5})}
});