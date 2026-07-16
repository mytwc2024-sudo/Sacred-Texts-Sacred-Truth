/**
 * Hand-maintained types for the AKST tables the frontend reads.
 *
 * These mirror the `akst_` schema (supabase/migrations/0001_akst_schema.sql).
 * For a fully generated set you can run, in the pipeline repo:
 *   supabase gen types typescript --project-id xhzyavyftgyqzftlqdlz
 * but this trimmed version is enough for the read-only frontend.
 */

export interface AkstText {
  id: string;
  title: string;
  subtitle: string | null;
  author: string | null;
  translator: string | null;
  civilization_id: string | null;
  tradition_id: string | null;
  language: string;
  original_language: string | null;
  estimated_date: string | null;
  source_url: string | null;
  source_name: string | null;
  word_count: number | null;
  chunk_count: number;
  is_public: boolean;
  is_featured: boolean;
  processing_status: 'pending' | 'processing' | 'complete' | 'error';
  created_at: string;
}

export interface AkstTextWithMetadata {
  id: string;
  title: string;
  subtitle: string | null;
  author: string | null;
  translator: string | null;
  civilization_name: string | null;
  tradition_name: string | null;
  language: string;
  original_language: string | null;
  estimated_date: string | null;
  word_count: number | null;
  chunk_count: number;
  is_featured: boolean;
  processing_status: string;
  source_url: string | null;
  source_name: string | null;
  created_at: string;
}

export interface AkstTextChunk {
  id: string;
  text_id: string;
  chunk_index: number;
  content: string;
  word_count: number | null;
  chapter_title: string | null;
  section_title: string | null;
  verse_number: string | null;
}

export interface AkstConcept {
  id: string;
  name: string;
  description: string | null;
  concept_type: 'theme' | 'character' | 'place' | 'practice' | 'deity' | 'philosophy';
  aliases: string[] | null;
  mention_count: number;
}

export interface AkstConceptNetworkRow {
  concept_id: string;
  concept_name: string;
  relationship_type: string | null;
  depth_level: number;
}

export interface SimilarChunk {
  chunk_id: string;
  text_id: string;
  text_title: string;
  content: string;
  similarity: number;
}

/**
 * Minimal `Database` shape so `createClient<Database>` gives typed results on
 * the handful of tables/RPCs the frontend touches.
 */
export interface Database {
  public: {
    Tables: {
      akst_texts: { Row: AkstText; Insert: never; Update: never };
      akst_text_chunks: { Row: AkstTextChunk; Insert: never; Update: never };
      akst_concepts: { Row: AkstConcept; Insert: never; Update: never };
    };
    Views: {
      akst_texts_with_metadata: { Row: AkstTextWithMetadata };
    };
    Functions: {
      akst_search_similar_chunks: {
        Args: { query_embedding: number[]; match_threshold?: number; match_count?: number };
        Returns: SimilarChunk[];
      };
      akst_get_concept_network: {
        Args: { concept_name_param: string; depth?: number };
        Returns: AkstConceptNetworkRow[];
      };
    };
  };
}
