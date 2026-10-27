import "server-only";

import { cache } from "react";

import type { AssetInfo } from "@/lib/portfolio";
import { createClient } from "@/lib/supabase/server";

/**
 * The asset catalogue (small, shared by every user). Used for the asset filter,
 * the form's asset picker and resolving text search to asset ids. Deduped per
 * request with `cache`.
 */
export const getAllAssets = cache(async (): Promise<AssetInfo[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assets")
    .select("id, symbol, name, type")
    .order("symbol", { ascending: true });

  if (error) throw new Error(`Failed to load assets: ${error.message}`);
  return data;
});
