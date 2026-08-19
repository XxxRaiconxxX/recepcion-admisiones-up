import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import type { PromesaRecord } from '../types/promises';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const isPromisesSupabaseConfigured = Boolean(
  /^https:\/\/.+\.supabase\.co$/i.test(supabaseUrl) && supabaseAnonKey.length > 20,
);

const supabase = isPromisesSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

export const fetchPromesas = async (): Promise<PromesaRecord[]> => {
  if (!supabase) return [];

  const pageSize = 1_000;
  const records: PromesaRecord[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('promesas')
      .select('*')
      .order('fecha_carga', { ascending: false, nullsFirst: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    records.push(...((data || []) as PromesaRecord[]));
    if (!data || data.length < pageSize) return records;
  }
};

type RealtimePromesaPayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: PromesaRecord;
  old: { id?: string };
};

export const subscribeToPromesas = (
  onChange: (payload: RealtimePromesaPayload) => void,
  onStatus: (status: string) => void,
) => {
  if (!supabase) return () => undefined;

  const channel: RealtimeChannel = supabase
    .channel('promesas-dashboard')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'promesas' },
      (payload) => onChange(payload as unknown as RealtimePromesaPayload),
    )
    .subscribe(onStatus);

  return () => {
    void supabase.removeChannel(channel);
  };
};
