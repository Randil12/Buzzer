import { createClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const db = url && key ? createClient(url, key) : null;
export type Room = { id: string; code: string; host_id: string; round: number; winner_id: string | null; winner_name: string | null; revision: number };
export type Player = { user_id: string; nickname: string; joined_at: string };
