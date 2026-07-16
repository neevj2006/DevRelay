import { AlertCircle } from "lucide-react";
import React from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FormFieldProps = {
  id: string;
  label: string;
  description?: string;
  error?: string;
  required?: boolean;
  children: React.ReactElement<{
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
    id?: string;
  }>;
  className?: string;
};

export function FormField({
  id,
  label,
  description,
  error,
  required,
  children,
  className,
}: FormFieldProps) {
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden="true" className="text-destructive">
            {" "}
            *
          </span>
        ) : null}
        {required ? <span className="sr-only"> required</span> : null}
      </Label>
      {React.cloneElement(children, {
        id,
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
        "aria-invalid": Boolean(error),
      })}
      {description ? (
        <p className="text-[13px] leading-5 text-muted-foreground" id={descriptionId}>
          {description}
        </p>
      ) : null}
      {error ? (
        <p className="text-[13px] leading-5 text-destructive" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ErrorSummary({
  errors,
}: {
  errors: ReadonlyArray<{ id: string; message: string }>;
}) {
  if (errors.length === 0) return null;
  return (
    <Alert className="border-destructive/40" role="alert">
      <AlertCircle aria-hidden="true" />
      <AlertTitle>Check the highlighted fields</AlertTitle>
      <AlertDescription>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          {errors.map((error) => (
            <li key={error.id}>
              <a className="text-link underline underline-offset-2" href={`#${error.id}`}>
                {error.message}
              </a>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
