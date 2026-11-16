/**
 * Renders JSON-LD.
 *
 * `JSON.stringify` alone is not safe inside a <script> tag: a value containing
 * the literal `</script>` ends the block early and everything after it is parsed
 * as HTML. Escaping `<` as the JSON escape `\u003c` is valid JSON, parses back
 * to the same string, and makes that impossible.
 *
 * This is the one place `dangerouslySetInnerHTML` is used with generated
 * content, so the escaping lives here rather than at each call site.
 */
export function JsonLd({ data }: { data: object | object[] }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
