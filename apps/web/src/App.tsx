import { useState } from "react";
import { authClient } from "./auth";
import { orpc } from "./orpc";
import "./App.css";

export function App() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("Sign in or create an account to continue.");
  const session = authClient.useSession();

  const signUp = async () => {
    const result = await authClient.signUp.email({ name: name.trim(), email: email.trim(), password });
    setMessage(result.error?.message ?? "Account created.");
  };

  const signIn = async () => {
    const result = await authClient.signIn.email({ email: email.trim(), password });
    setMessage(result.error?.message ?? "Signed in.");
  };

  const signOut = async () => {
    await authClient.signOut();
    setMessage("Signed out.");
  };

  const callApi = async () => {
    try {
      const result = await orpc.hello();
      setMessage(result.message);
    } catch (error) {
      console.error("The protected hello request failed.", error);
      setMessage("The protected request was rejected. Sign in first.");
    }
  };

  return (
    <main className="app-shell">
      <header className="brand">
        <p className="eyebrow">Final year project</p>
        <h1>FYP</h1>
        <p>A small, secure starting point for the project.</p>
      </header>

      <section className="auth-card" aria-labelledby="auth-heading">
        <h2 id="auth-heading">{session.data ? "Your account" : "Welcome back"}</h2>
        <p className="muted">
          {session.data ? `Signed in as ${session.data.user.email}` : "Use your email to access the app."}
        </p>

        {!session.data ? (
          <form onSubmit={(event) => event.preventDefault()}>
            <label>
              Name
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Jane Doe" required autoComplete="name" />
            </label>
            <label>
              Email
              <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="jane@example.com" type="email" required autoComplete="email" />
            </label>
            <label>
              Password
              <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" type="password" required minLength={8} autoComplete="current-password" />
            </label>
            <div className="actions">
              <button className="primary" type="submit" onClick={signIn}>Sign in</button>
              <button type="submit" onClick={signUp}>Create account</button>
            </div>
          </form>
        ) : (
          <div className="actions">
            <button className="primary" type="button" onClick={callApi}>Call protected oRPC</button>
            <button type="button" onClick={signOut}>Sign out</button>
          </div>
        )}

        {session.isPending && <p className="status">Loading session...</p>}
        {session.error && <p className="status">{session.error.message}</p>}
        {message && <p className="status">{message}</p>}
      </section>
    </main>
  );
}
