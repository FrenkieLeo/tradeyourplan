import { createBrowserClient } from "@supabase/ssr";
import { getPublicSupabaseConfig } from "./config";

export function createSupabaseBrowserClient() {
  const { url, anonKey } = getPublicSupabaseConfig();
  return createBrowserClient(url, anonKey);
}
