import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AkstText, AkstTextChunk, AkstTextWithMetadata } from '@/integrations/supabase/types';

/** All public texts (with civilization/tradition names), newest first. */
export function useTexts() {
  return useQuery<AkstTextWithMetadata[]>({
    queryKey: ['akst-texts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('akst_texts_with_metadata')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Featured texts for the homepage. */
export function useFeaturedTexts() {
  return useQuery<AkstText[]>({
    queryKey: ['akst-featured-texts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('akst_texts')
        .select('*')
        .eq('is_public', true)
        .eq('is_featured', true)
        .order('title');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** A single text by id. */
export function useText(textId: string | undefined) {
  return useQuery<AkstText>({
    queryKey: ['akst-text', textId],
    enabled: !!textId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('akst_texts')
        .select('*')
        .eq('id', textId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

/** The chunks (reader content) for a text, in order. */
export function useTextChunks(textId: string | undefined) {
  return useQuery<AkstTextChunk[]>({
    queryKey: ['akst-text-chunks', textId],
    enabled: !!textId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('akst_text_chunks')
        .select('*')
        .eq('text_id', textId!)
        .order('chunk_index', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}
