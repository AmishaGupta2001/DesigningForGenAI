import type { GlossaryTerm } from "@/lib/glossary";

export default function GlossaryDisclosure({ terms }: { terms: GlossaryTerm[] }) {
  if (!terms.length) return null;
  return <details className="glossary-disclosure">
    <summary>A little context</summary>
    <dl>
      {terms.map((item) => <div className="glossary-disclosure__item" key={`${item.term}-${item.category ?? ""}`}>
        <dt>{item.term}{item.category && <span className="glossary-disclosure__category">{item.category}</span>}</dt>
        <dd>{item.definition || "No definition is available yet."}</dd>
      </div>)}
    </dl>
  </details>;
}
