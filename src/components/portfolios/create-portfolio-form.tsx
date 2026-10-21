"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus } from "lucide-react";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { createPortfolio } from "@/app/(app)/portfolios/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { portfolioFormSchema, type PortfolioFormInput } from "@/lib/validation";

export function CreatePortfolioForm() {
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<PortfolioFormInput>({
    resolver: zodResolver(portfolioFormSchema),
    defaultValues: { name: "" },
  });

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await createPortfolio(values);
      if (result.ok) {
        toast.success("Portfolio created");
        reset();
        return;
      }
      const nameError = result.fieldErrors?.name?.[0];
      if (nameError) setError("name", { message: nameError });
      else toast.error(result.error);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-2">
      <Label htmlFor="new-portfolio-name">New portfolio</Label>
      <div className="flex gap-2">
        <Input
          id="new-portfolio-name"
          placeholder="e.g. Retirement"
          autoComplete="off"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={
            errors.name ? "new-portfolio-name-error" : undefined
          }
          {...register("name")}
        />
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <Plus aria-hidden />
          )}
          Create
        </Button>
      </div>
      {errors.name ? (
        <p
          id="new-portfolio-name-error"
          role="alert"
          className="text-sm text-destructive"
        >
          {errors.name.message}
        </p>
      ) : null}
    </form>
  );
}
