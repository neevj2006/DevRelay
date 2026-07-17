import { SubscriberPreferencesForm } from "@/components/subscriber-preferences-form";
export default function PreferencesPage() {
  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 py-20">
      <section className="rounded-xl border bg-card p-6">
        <h1 className="mb-5 text-2xl font-semibold">Notification preferences</h1>
        <SubscriberPreferencesForm />
      </section>
    </main>
  );
}
