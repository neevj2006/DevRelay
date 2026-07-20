import { notFound } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
export default async function PublicPostmortemPage({
  params,
}: {
  params: Promise<{ statusPageSlug: string; postmortemSlug: string }>;
}) {
  const { statusPageSlug, postmortemSlug } = await params;
  const response = await fetch(
    `${process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/public/status-pages/${statusPageSlug}/postmortems/${postmortemSlug}`,
    { next: { revalidate: 60 } },
  );
  if (!response.ok) notFound();
  const p = (await response.json()) as {
    title: string;
    summary: string;
    impact: string;
    timeline: string;
    rootCause: string;
    resolution: string;
    actionItems: { description: string; owner?: string }[];
    publishedAt: string;
  };
  return (
    <main className="mx-auto min-h-screen max-w-3xl space-y-8 px-5 py-12">
      <header>
        <a className="text-sm text-primary" href={`/status/${statusPageSlug}`}>
          ← Status page
        </a>
        <h1 className="mt-4 text-3xl font-bold">{p.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Published {new Date(p.publishedAt).toISOString()}
        </p>
      </header>
      {[
        ["Summary", p.summary],
        ["Impact", p.impact],
        ["Timeline", p.timeline],
        ["Root cause", p.rootCause],
        ["Resolution", p.resolution],
      ].map(([title, body]) => (
        <Card key={title}>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm leading-6">{body}</p>
          </CardContent>
        </Card>
      ))}
      <Card>
        <CardHeader>
          <CardTitle>Action items</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-2 pl-5 text-sm">
            {p.actionItems.map((item, index) => (
              <li key={index}>
                {item.description}
                {item.owner ? ` - ${item.owner}` : ""}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}
