"use client";

import { Lock, Megaphone, Send } from "lucide-react";
import { useState } from "react";

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
import { Textarea } from "@/components/ui/textarea";

export function IncidentComposers() {
  const [publicUpdate, setPublicUpdate] = useState(
    "We have shifted traffic and are seeing recovery. We continue to monitor.",
  );
  const [privateNote, setPrivateNote] = useState("");
  return (
    <section aria-labelledby="incident-composers-title" className="space-y-4">
      <h2 className="sr-only" id="incident-composers-title">
        Add incident communication
      </h2>
      <article className="rounded-xl border border-primary bg-brand-soft p-5 text-brand-soft-foreground">
        <div className="flex items-start gap-3">
          <Megaphone aria-hidden="true" className="mt-0.5 size-5" />
          <div>
            <h3 className="font-semibold">Public update</h3>
            <p className="mt-1 text-sm leading-6">
              Visible on the status page and eligible for subscriber delivery.
            </p>
          </div>
        </div>
        <Textarea
          aria-label="Public update message"
          className="mt-4 bg-card text-foreground"
          maxLength={500}
          onChange={(event) => setPublicUpdate(event.target.value)}
          value={publicUpdate}
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-xs">{publicUpdate.length}/500</span>
          <Dialog>
            <DialogTrigger asChild>
              <Button disabled={!publicUpdate.trim()}>
                <Megaphone aria-hidden="true" />
                Review public update
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Publish this customer update?</DialogTitle>
                <DialogDescription>
                  Review the exact message before it appears publicly and enters notification
                  delivery.
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-lg border border-primary bg-brand-soft p-4 text-sm text-brand-soft-foreground">
                <p className="mb-2 flex items-center gap-2 font-semibold">
                  <Megaphone aria-hidden="true" className="size-4" />
                  Public update
                </p>
                {publicUpdate}
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Keep editing</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button>
                    <Send aria-hidden="true" />
                    Publish update
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </article>
      <article className="rounded-xl border border-dashed border-border-strong bg-surface-subtle p-5">
        <div className="flex items-start gap-3">
          <Lock aria-hidden="true" className="mt-0.5 size-5 text-muted-foreground" />
          <div>
            <h3 className="font-semibold">Internal only</h3>
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              Visible to organization members. Never sent to subscribers or public pages.
            </p>
          </div>
        </div>
        <Textarea
          aria-label="Private incident note"
          className="mt-4"
          maxLength={2000}
          onChange={(event) => setPrivateNote(event.target.value)}
          placeholder="Add technical context, a decision, or a safe evidence reference…"
          value={privateNote}
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">{privateNote.length}/2000</span>
          <Button disabled={!privateNote.trim()} variant="secondary">
            <Lock aria-hidden="true" />
            Add private note
          </Button>
        </div>
      </article>
    </section>
  );
}
