"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Pencil } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { renamePortfolio } from "@/app/(app)/portfolios/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { portfolioFormSchema, type PortfolioFormInput } from "@/lib/validation";

interface RenamePortfolioDialogProps {
  id: string;
  currentName: string;
}

export function RenamePortfolioDialog({
  id,
  currentName,
}: RenamePortfolioDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<PortfolioFormInput>({
    resolver: zodResolver(portfolioFormSchema),
    defaultValues: { name: currentName },
  });

  function handleOpenChange(next: boolean) {
    // Reset to the saved name every time the dialog opens.
    if (next) reset({ name: currentName });
    setOpen(next);
  }

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await renamePortfolio({ id, name: values.name });
      if (result.ok) {
        toast.success("Portfolio renamed");
        setOpen(false);
        return;
      }
      const nameError = result.fieldErrors?.name?.[0];
      if (nameError) setError("name", { message: nameError });
      else toast.error(result.error);
    });
  });

  const inputId = `rename-${id}`;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Rename ${currentName}`}
          />
        }
      >
        <Pencil aria-hidden />
        Rename
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Rename portfolio</DialogTitle>
            <DialogDescription>
              Choose a new name for “{currentName}”.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor={inputId}>Name</Label>
            <Input
              id={inputId}
              autoComplete="off"
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? `${inputId}-error` : undefined}
              {...register("name")}
            />
            {errors.name ? (
              <p
                id={`${inputId}-error`}
                role="alert"
                className="text-sm text-destructive"
              >
                {errors.name.message}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : null}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
