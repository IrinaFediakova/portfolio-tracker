import "server-only";

/**
 * Server-only environment variables. The `server-only` import makes the build
 * fail if this module is ever pulled into a Client Component, so the demo
 * credentials cannot leak into the client bundle.
 */
export interface DemoCredentials {
  email: string;
  password: string;
}

/** Returns the demo credentials, or `null` when the demo user is not configured. */
export function getDemoCredentials(): DemoCredentials | null {
  const email = process.env.DEMO_USER_EMAIL;
  const password = process.env.DEMO_USER_PASSWORD;
  if (!email || !password) return null;
  return { email, password };
}
