"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, MailCheck } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { signUp } from "@/app/(auth)/actions";
import { AuthField } from "@/components/auth/auth-field";
import { Button } from "@/components/ui/button";
import { signUpSchema, type SignUpInput } from "@/lib/validation";

export function SignupForm() {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmationMessage, setConfirmationMessage] = useState<string | null>(
    null,
  );

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: "", password: "", confirmPassword: "" },
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      // With email confirmation off the action redirects; otherwise we get a message.
      const result = await signUp(values);
      if (!result) return;
      if (result.ok) {
        setConfirmationMessage(result.message);
        return;
      }
      setFormError(result.error);
      for (const [field, messages] of Object.entries(
        result.fieldErrors ?? {},
      )) {
        if (
          field === "email" ||
          field === "password" ||
          field === "confirmPassword"
        ) {
          setError(field, { message: messages?.[0] });
        }
      }
    });
  });

  if (confirmationMessage) {
    return (
      <div
        role="status"
        className="flex items-start gap-3 rounded-lg bg-muted p-4 text-sm"
      >
        <MailCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>{confirmationMessage}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <AuthField
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register("email")}
      />
      <AuthField
        id="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        error={errors.password?.message}
        {...register("password")}
      />
      <AuthField
        id="confirmPassword"
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        {...register("confirmPassword")}
      />

      {formError ? (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      ) : null}

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Create account
      </Button>
    </form>
  );
}
