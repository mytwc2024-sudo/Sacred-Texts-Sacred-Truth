import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * "Ask AKST" — semantic Q&A over the sacred-text corpus.
 *
 * IMPORTANT: the query must be embedded server-side, because embedding needs
 * the OpenAI key which must never live in the browser. This hook calls the
 * Supabase Edge Function `akst-ask` (see supabase/functions/akst-ask in the
 * pipeline repo), which:
 *   1. embeds the question with OpenAI,
 *   2. calls the akst_search_similar_chunks RPC,
 *   3. (optionally) synthesizes an answer with citations,
 * and returns { answer, sources }.
 */
export interface AskSource {
  chunk_id: string;
  text_id: string;
  text_title: string;
  content: string;
  similarity: number;
}

export interface AskResult {
  answer: string;
  sources: AskSource[];
}

export function useAsk() {
  return useMutation<AskResult, Error, string>({
    mutationFn: async (question: string) => {
      const { data, error } = await supabase.functions.invoke<AskResult>('akst-ask', {
        body: { question },
      });
      if (error) throw error;
      if (!data) throw new Error('No response from akst-ask');
      return data;
    },
  });
}
