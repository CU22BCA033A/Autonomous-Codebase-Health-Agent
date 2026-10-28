"use client";
import { startTransition, type FormEvent } from "react";

/**
 * React 19 resets uncontrolled forms after an action runs, which wipes what the user typed when
 * the server returns an error. Submitting through this handler keeps the inputs.
 */
export function keepFormOnSubmit(action: (form: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(() => action(form));
  };
}
