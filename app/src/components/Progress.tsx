/** Item progress bar: complete · on site · in production · approved · in drawings. Zero segments are skipped so the gaps don't show. */
export default function Progress({ done, site, prod, appr, todo, title }: { done: number; site: number; prod: number; appr: number; todo: number; title?: string }) {
  const segs: [string, number][] = [["done", done], ["site", site], ["prod", prod], ["appr", appr], ["todo", todo]];
  return <div className="progress" title={title} aria-label={title}>{segs.filter(([, n]) => n > 0).map(([k, n]) => <span key={k} className={k} style={{ flex: n }} />)}</div>;
}
