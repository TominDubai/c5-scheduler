import Link from "next/link";

// Rendered when a page can't load its data. Shows the real reason so it can be fixed, with a way back.
export default function Failed({ what, error }: { what: string; error: unknown }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div className="page">
      <div className="panel">
        <h2>Couldn’t load {what}</h2>
        <p style={{ margin: 0 }}>Something went wrong talking to the database. Send this line to Tom:</p>
        <code style={{ display: "block", padding: 12, background: "var(--bg)", borderRadius: 8, fontFamily: "var(--mono)", fontSize: 13, whiteSpace: "pre-wrap" }}>{msg}</code>
        <div className="actions"><Link href="/login" className="btn ghost">Back to sign in</Link></div>
      </div>
    </div>
  );
}
