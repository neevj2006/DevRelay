import { SubscriptionTokenFlow } from "@/components/subscription-token-flow";

export default function UnsubscribePage() {
  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 py-20">
      <section className="rounded-xl border bg-card p-6">
        <h1 className="mb-4 text-2xl font-semibold">Unsubscribe from status updates</h1>
        <SubscriptionTokenFlow mode="unsubscribe" />
      </section>
    </main>
  );
}
