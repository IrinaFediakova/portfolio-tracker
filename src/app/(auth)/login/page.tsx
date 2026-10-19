import type { Metadata } from "next";
import Link from "next/link";

import { DemoLoginButton } from "@/components/auth/demo-login-button";
import { LoginForm } from "@/components/auth/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getDemoCredentials } from "@/lib/env.server";
import { safeRedirectPath } from "@/lib/redirect";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const nextPath = safeRedirectPath(Array.isArray(next) ? next[0] : next);
  // Only a boolean crosses to the client; the credentials stay on the server.
  const demoEnabled = getDemoCredentials() !== null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>Welcome back</h1>
        </CardTitle>
        <CardDescription>Sign in to your portfolio dashboard.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <LoginForm next={nextPath} />
        {demoEnabled ? (
          <>
            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">or</span>
              <Separator className="flex-1" />
            </div>
            <DemoLoginButton />
          </>
        ) : null}
      </CardContent>
      <CardFooter className="justify-center text-sm text-muted-foreground">
        <p>
          No account?{" "}
          <Link
            href="/signup"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Sign up
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
