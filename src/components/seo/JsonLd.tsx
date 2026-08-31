// schema.org structured data — what Yandex (search, Neuro AI answers) and
// Google read to build rich snippets and lift direct answers. Rendered
// server-side so crawlers see it without executing JS.
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
