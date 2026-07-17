import { SubscriptionTokenFlow } from "@/components/subscription-token-flow";

export default async function VerifySubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 py-20">
      <section className="rounded-xl border bg-card p-6">
        <h1 className="mb-4 text-2xl font-semibold">Confirm status updates</h1>
        <SubscriptionTokenFlow mode="verify" token={token} />
      </section>
    </main>
  );
}
