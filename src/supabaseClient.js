import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// If the environment variables aren't set yet, `configured` stays false and
// the app falls back to local-only mode instead of crashing. This lets the
// app still work before Merna finishes the one-time Supabase setup.
export const cloudConfigured = Boolean(url && anonKey);

export const supabase = cloudConfigured ? createClient(url, anonKey) : null;
