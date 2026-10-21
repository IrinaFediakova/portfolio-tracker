import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/**
 * The authenticated user, or null. `React.cache` dedupes the call within one
 * request, so the layout and the page can both ask without a second round trip
 * to Supabase Auth.
 *
 * Uses `getUser()` (validates the JWT with the Auth server) rather than
 * `getSession()`, so it is safe to base access decisions on.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
