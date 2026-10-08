import LoginForm from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="login">
      <img className="logo" src="/c5-logo.png" alt="Concept 5 Kitchen & Wood Industries" />
      <div className="panel">
        <h1>Sign in</h1>
        <p>Enter your work email and we’ll send you a sign-in link. No password needed.</p>
        <LoginForm />
        {error === "not_allowed" && <span className="msg err">That email isn’t on the Concept 5 team list. Ask Tom or Aftab to add you.</span>}
        {error === "link" && <span className="msg err">That link has expired or was already used. Request a new one.</span>}
      </div>
    </div>
  );
}
