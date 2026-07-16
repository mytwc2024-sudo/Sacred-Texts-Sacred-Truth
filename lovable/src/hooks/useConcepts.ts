import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AkstConcept, AkstConceptNetworkRow } from '@/integrations/supabase/types';

/** All concepts, most-mentioned first (for the concept explorer). */
export function useConcepts() {
  return useQuery<AkstConcept[]>({
    queryKey: ['akst-concepts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('akst_concepts')
        .select('*')
        .order('mention_count', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** The relationship network around one concept (graph walk RPC). */
export function useConceptNetwork(conceptName: string | undefined, depth = 1) {
  return useQuery<AkstConceptNetworkRow[]>({
    queryKey: ['akst-concept-network', conceptName, depth],
    enabled: !!conceptName,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('akst_get_concept_network', {
        concept_name_param: conceptName!,
        depth,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}
