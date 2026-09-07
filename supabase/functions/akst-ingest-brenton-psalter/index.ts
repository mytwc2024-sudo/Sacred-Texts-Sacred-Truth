import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.4";
import { unzipSync } from "npm:fflate@0.8.2";

const DB=Deno.env.get("SUPABASE_DB_URL");
const ZIP="https://ebible.org/Scriptures/eng-Brenton_usfm.zip";
const MEMBER="20-PSAeng-Brenton.usfm";
const KEY="psalter:brenton-1851:ebible-2025-12-12";
const RAW_SHA="12602415af372ce675b511eae878b94fd12e048dd882110a3ce130d0eeed8622";

function reply(x,s=200){return new Response(JSON.stringify(x),{status:s,headers:{"content-type":"application/json","cache-control":"no-store"}})}
function equal(a,b){if(!a||!b||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0}
async function hash(s){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function noteText(s){return s.replace(/\\(?:fr|fqa|ft|fk|fl|fp|fv|xt|xo|xk|xq)\s+/g," ").replace(/\\[a-zA-Z0-9]+\*?\s*/g," ").replace(/\s+/g," ").trim()}
function marker(s,m){const r=new RegExp("\\\\"+m+"\\s+([\\s\\S]*?)(?=\\\\[a-zA-Z0-9]+|$)");return s.match(r)?.[1]?.trim()||null}
function parseInline(src,path){
  const notes=[];let f=0,x=0;
  let text=src.replace(/\\f\s+\+\s+([\s\S]*?)\\f\*/g,(whole,inner)=>{
    f++;const labels=[...String(inner).matchAll(/\\fqa\s+([\s\S]*?)(?=\\(?:ft|fqa|fr|fk|fl|fp|fv)\s+|$)/g)].map(m=>m[1].trim()).filter(Boolean).join(" | ");
    notes.push({unit_path:path,note_sequence:f,note_type:"footnote",caller:"+",source_locator:marker(inner,"fr"),label:labels||null,content:noteText(inner),raw_markup:whole});return "";
  });
  text=text.replace(/\\x\s+\+\s+([\s\S]*?)\\x\*/g,(whole,inner)=>{
    x++;notes.push({unit_path:path,note_sequence:x,note_type:"cross_reference",caller:"+",source_locator:marker(inner,"xo"),label:null,content:noteText(inner),raw_markup:whole});return "";
  });
  text=text.replace(/\\add\s+([\s\S]*?)\\add\*/g,"$1").replace(/\\sc\s+([\s\S]*?)\\sc\*/g,"$1").replace(/\\nd\s+([\s\S]*?)\\nd\*/g,"$1").replace(/\\[a-zA-Z0-9]+\*?\s*/g,"").replace(/\s+/g," ").trim();
  return {text,notes};
}
async function bulk(tx,table,cols,rows){
  if(!rows.length)return;
  const width=cols.length,params=[];
  const groups=rows.map((row,i)=>{
    for(const c of cols)params.push(row[c]??null);
    return "("+cols.map((_,j)=>"$"+(i*width+j+1)).join(",")+")";
  });
  await tx.unsafe("insert into public."+table+" ("+cols.join(",")+") values "+groups.join(","),params);
}

Deno.serve(async req=>{
  if(req.method!=="POST")return reply({error:"POST required"},405);
  const sql=postgres(DB,{prepare:false,max:2,idle_timeout:10,connect_timeout:10});
  try{
    const secretRows=await sql.unsafe("select decrypted_secret as secret from vault.decrypted_secrets where name='oracle_transport_token' limit 1");
    if(!equal(req.headers.get("x-oracle-transport-secret")||"",secretRows[0]?.secret||""))return reply({error:"Unauthorized transport"},401);

    const res=await fetch(ZIP,{headers:{"user-agent":"AKST-Ingestion/1.0"}});
    if(!res.ok)throw new Error("source fetch "+res.status);
    const members=unzipSync(new Uint8Array(await res.arrayBuffer()));
    const bytes=members[MEMBER];if(!bytes)throw new Error("missing "+MEMBER);
    const raw=new TextDecoder("utf-8",{fatal:true}).decode(bytes).replace(/\r\n/g,"\n");
    const rawSha=await hash(raw);
    if(rawSha!==RAW_SHA)return reply({ok:false,held:true,reason:"checksum",expected:RAW_SHA,observed:rawSha},409);

    const chapters=new Set(),units=[],notes=[];let chapter=0;
    for(const line of raw.split("\n")){
      const cm=line.match(/^\\c\s+(\d+)/);if(cm){chapter=Number(cm[1]);chapters.add(chapter);continue}
      const vm=line.match(/^\\v\s+([^\s]+)\s+([\s\S]*?)\s*$/);
      if(vm){
        const path=chapter+":"+vm[1],p=parseInline(vm[2],path);if(!p.text)throw new Error("empty "+path);
        notes.push(...p.notes);
        units.push({unit_path:path,chapter,verse:vm[1],content:p.text,source_markup:vm[2],source_sequence:units.length+1,apparatus_count:p.notes.length});
        continue;
      }
      const pm=line.match(/^\\p\s+([\s\S]+?)\s*$/);
      if(pm&&units.length){
        const prior=units[units.length-1],p=parseInline(pm[1],prior.unit_path);if(!p.text)throw new Error("empty continuation "+prior.unit_path);
        prior.content=(prior.content+" "+p.text).replace(/\s+/g," ").trim();
        prior.source_markup=prior.source_markup+"\n\\p "+pm[1];
        prior.apparatus_count+=p.notes.length;
        notes.push(...p.notes);
      }
    }
    const dup=units.length-new Set(units.map(u=>u.unit_path)).size;
    const missing=["115:4a","144:13a"].filter(k=>!units.some(u=>u.unit_path===k));
    const foot=notes.filter(n=>n.note_type==="footnote").length;
    const cross=notes.filter(n=>n.note_type==="cross_reference").length;
    const fqa=(raw.match(/\\fqa\s/g)||[]).length;
    if(chapters.size!==151||units.length!==2535||dup||missing.length)return reply({ok:false,held:true,chapters:chapters.size,units:units.length,duplicates:dup,missing_repairs:missing,footnotes:foot,crossrefs:cross,fqa},409);

    const full=units.map(u=>u.content).join("\n"),normSha=await hash(full);
    const words=units.reduce((n,u)=>n+(u.content.match(/\S+/g)||[]).length,0);

    const out=await sql.begin(async tx=>{
      let rr=await tx.unsafe("select id from public.akst_source_registry where title=$1 and source_url=$2 limit 1",["Psalter — Brenton English Septuagint witness",ZIP]);
      if(!rr.length)rr=await tx.unsafe("insert into public.akst_source_registry (title,original_author,translator,edition_year,original_year,category,tradition,rights_status,rights_basis,rights_verified_on,rights_verified_by,content_tier,source_name,source_url,ingest_status,priority,notes) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,current_date,$10,$11,$12,$13,$14,$15,$16) returning id",[
        "Psalter — Brenton English Septuagint witness","Multiple / traditional","Sir Lancelot C. L. Brenton",1851,"Ancient Greek Psalter; Brenton translation published 1851","other","Septuagint / Psalter","public_domain","Brenton translation published 1851; eBible identifies the exact eng-Brenton electronic edition as Public Domain.","AKST automated source verification; interpretation and ownership reserved to Andre","A","eBible.org — eng-Brenton USFM",ZIP,"ingesting",1,"Book-level child witness of Brenton registry a9248aad-88f2-4710-9f1d-3b51c19269e3. Ge'ez is absent and held open."
      ]);
      const rid=rr[0].id;

      await tx.unsafe("insert into public.akst_source_assets (source_registry_id,witness_key,source_url,source_file_name,source_format,raw_content,byte_count,sha256,retrieved_at,metadata) values ($1,$2,$3,$4,$5,$6,$7,$8,now(),$9::jsonb) on conflict (witness_key,sha256) do update set retrieved_at=excluded.retrieved_at,metadata=excluded.metadata",[
        rid,KEY,ZIP,MEMBER,"USFM",raw,bytes.byteLength,rawSha,JSON.stringify({chapters:151,units:2535,footnote_blocks:foot,footnote_label_segments:fqa,cross_references:cross,source_files_dated:"2025-12-12"})
      ]);

      let tr=await tx.unsafe("select id from public.akst_texts where witness_key=$1 limit 1",[KEY]);
      if(!tr.length)tr=await tx.unsafe("insert into public.akst_texts (title,subtitle,author,translator,language,original_language,estimated_date,source_url,source_name,full_text,word_count,chunk_count,is_public,is_featured,processing_status,content_tier,rights_status,rights_note,rights_verified_on,rights_verified_by,access_scope,work_key,witness_key,source_checksum_sha256,source_format,source_file_name,source_acquired_at,unit_model,expected_unit_count,observed_unit_count,verification_status,verification_note,parent_source_registry_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,false,false,'processing','A','public_domain',$13,current_date,$14,'private','psalter',$15,$16,'USFM',$17,now(),'psalm:verse/subverse',2535,2535,'verifying',$18,$19) returning id",[
        "Psalter","Brenton English Septuagint, 1851 access-layer witness","Multiple / traditional","Sir Lancelot C. L. Brenton","en","Greek","Ancient Greek Psalter; English translation published 1851",ZIP+"#"+MEMBER,"eBible.org — Brenton English Septuagint",full,words,2535,"Exact eBible eng-Brenton witness identified as Public Domain; attribution retained.","AKST source verification",KEY,rawSha,MEMBER,"Precheck passed: 151 psalms; 2,535 units; repairs 115:4a and 144:13a present.",rid
      ]);
      const tid=tr[0].id;
      await tx.unsafe("update public.akst_texts set full_text=$1,word_count=$2,chunk_count=2535,source_checksum_sha256=$3,source_acquired_at=now(),expected_unit_count=2535,observed_unit_count=2535,verification_status='verifying',processing_status='processing',is_public=false,access_scope='private',verification_note=$4,updated_at=now() where id=$5",[
        full,words,rawSha,"Reingestion precheck passed; paragraph continuations included; database reconstruction pending.",tid
      ]);
      await tx.unsafe("delete from public.akst_apparatus_notes where text_id=$1",[tid]);
      await tx.unsafe("delete from public.akst_text_chunks where text_id=$1",[tid]);
      const chunkRows=units.map((u,i)=>({text_id:tid,chunk_index:i,content:u.content,word_count:(u.content.match(/\S+/g)||[]).length,chapter_title:"Psalm "+u.chapter,section_title:"Psalms",verse_number:u.verse,unit_path:u.unit_path,source_sequence:u.source_sequence,source_checksum_sha256:rawSha,source_markup:u.source_markup,apparatus_count:u.apparatus_count}));
      await bulk(tx,"akst_text_chunks",["text_id","chunk_index","content","word_count","chapter_title","section_title","verse_number","unit_path","source_sequence","source_checksum_sha256","source_markup","apparatus_count"],chunkRows);
      const ids=await tx.unsafe("select id,unit_path from public.akst_text_chunks where text_id=$1",[tid]);
      const map=new Map(ids.map(r=>[r.unit_path,r.id]));
      const noteRows=notes.map(n=>({...n,text_id:tid,chunk_id:map.get(n.unit_path),source_checksum_sha256:rawSha}));
      await bulk(tx,"akst_apparatus_notes",["text_id","chunk_id","unit_path","note_sequence","note_type","caller","source_locator","label","content","raw_markup","source_checksum_sha256"],noteRows);
      const ck=(await tx.unsafe("select count(*)::int observed,count(distinct unit_path)::int distinct_units,min(source_sequence)::int first_sequence,max(source_sequence)::int last_sequence,string_agg(content,E'\\n' order by source_sequence) reconstructed,coalesce(sum(word_count),0)::int chunk_words,(select count(*)::int from public.akst_apparatus_notes where text_id=$1) note_count from public.akst_text_chunks where text_id=$1",[tid]))[0];
      const reSha=await hash(ck.reconstructed);
      if(ck.observed!==2535||ck.distinct_units!==2535||ck.first_sequence!==1||ck.last_sequence!==2535||ck.chunk_words!==words||ck.reconstructed!==full||reSha!==normSha)throw new Error("post-write reconstruction failed");
      const msg="Accepted: 151/151 psalms; 2,535/2,535 units; exact reconstruction; repairs 115:4a and 144:13a present; raw SHA-256 "+rawSha+"; normalized SHA-256 "+normSha+"; apparatus "+notes.length+" records ("+foot+" footnotes, "+cross+" cross-references; "+fqa+" fqa segments). Ge'ez absent/held open.";
      await tx.unsafe("update public.akst_texts set verification_status='accepted',verification_note=$1,processing_status='complete',is_public=true,access_scope='public',updated_at=now() where id=$2",[msg,tid]);
      await tx.unsafe("update public.akst_source_registry set akst_text_id=$1,ingest_status='ingested',updated_at=now(),notes=coalesce(notes,'')||$2 where id=$3",[tid," "+msg,rid]);
      return {already:false,text_id:tid,registry_id:rid,psalms:151,units:2535,words,raw_sha256:rawSha,normalized_sha256:normSha,footnote_blocks:foot,footnote_label_segments:fqa,cross_references:cross,apparatus_records:notes.length,exact_reconstruction:true};
    });
    return reply({ok:true,accepted:true,witness_key:KEY,...out});
  }catch(e){return reply({ok:false,error:e instanceof Error?e.message:String(e)},500)}
  finally{await sql.end({timeout:5})}
});