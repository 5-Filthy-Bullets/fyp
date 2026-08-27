import { useState, type FormEvent } from "react";
import heroImg from "./assets/hero.png";
import reactLogo from "./assets/react.svg";
import viteLogo from "./assets/vite.svg";
import "./App.css";
import { orpc } from "./orpc";
import { authClient } from "./auth-client";

function App() {
  const [count, setCount] = useState(0);
  const [message, setMessage] = useState("Call the API to check the connection.");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const { data: session, isPending, refetch } = authClient.useSession();

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = isSignUp
      ? await authClient.signUp.email({ name, email, password })
      : await authClient.signIn.email({ email, password });
    setAuthMessage(result.error?.message ?? (isSignUp ? "Account created." : "Signed in."));
    await refetch();
  };

  const signOut = async () => {
    await authClient.signOut();
    await refetch();
    setAuthMessage("Signed out.");
  };

  const callApi = async () => {
    const result = await orpc.hello();
    setMessage(result.message);
  };

  return (
    <>
      <section id="center">
        <div className="hero">
          <img src={heroImg} className="base" width="170" height="179" alt="" />
          <img src={reactLogo} className="framework" alt="React logo" />
          <img src={viteLogo} className="vite" alt="Vite logo" />
        </div>
        <div>
          <h1>Get started</h1>
          <p>
            Edit <code>src/App.tsx</code> and save to test <code>HMR</code>
          </p>
        </div>
        <button type="button" className="counter" onClick={() => setCount((count) => count + 1)}>
          Count is {count}
        </button>
        <button type="button" onClick={callApi}>
          Call oRPC
        </button>
        <p>{message}</p>
        <div className="auth-card">
          <h2>
            {session
              ? `Signed in as ${session.user.name}`
              : isSignUp
                ? "Create account"
                : "Sign in"}
          </h2>
          {session ? (
            <button type="button" onClick={signOut}>
              Sign out
            </button>
          ) : (
            <form onSubmit={submitAuth}>
              {isSignUp && (
                <input
                  required
                  placeholder="Name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              )}
              <input
                required
                type="email"
                placeholder="Email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <input
                required
                minLength={8}
                type="password"
                placeholder="Password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button type="submit" disabled={isPending}>
                {isSignUp ? "Create account" : "Sign in"}
              </button>
            </form>
          )}
          <button
            className="auth-toggle"
            type="button"
            onClick={() => setIsSignUp((value) => !value)}
          >
            {isSignUp ? "Already have an account? Sign in" : "Need an account? Sign up"}
          </button>
          {authMessage && <p role="status">{authMessage}</p>}
        </div>
      </section>

      <div className="ticks"></div>

      <section id="next-steps">
        <div id="docs">
          <svg className="icon" role="presentation" aria-hidden="true">
            <use href="/icons.svg#documentation-icon"></use>
          </svg>
          <h2>Documentation</h2>
          <p>Your questions, answered</p>
          <ul>
            <li>
              <a href="https://vite.dev/" target="_blank" rel="noopener">
                <img className="logo" src={viteLogo} alt="" />
                Explore Vite
              </a>
            </li>
            <li>
              <a href="https://react.dev/" target="_blank" rel="noopener">
                <img className="button-icon" src={reactLogo} alt="" />
                Learn more
              </a>
            </li>
          </ul>
        </div>
        <div id="social">
          <svg className="icon" role="presentation" aria-hidden="true">
            <use href="/icons.svg#social-icon"></use>
          </svg>
          <h2>Connect with us</h2>
          <p>Join the Vite community</p>
          <ul>
            <li>
              <a href="https://github.com/vitejs/vite" target="_blank" rel="noopener">
                <svg className="button-icon" role="presentation" aria-hidden="true">
                  <use href="/icons.svg#github-icon"></use>
                </svg>
                GitHub
              </a>
            </li>
            <li>
              <a href="https://chat.vite.dev/" target="_blank" rel="noopener">
                <svg className="button-icon" role="presentation" aria-hidden="true">
                  <use href="/icons.svg#discord-icon"></use>
                </svg>
                Discord
              </a>
            </li>
            <li>
              <a href="https://x.com/vite_js" target="_blank" rel="noopener">
                <svg className="button-icon" role="presentation" aria-hidden="true">
                  <use href="/icons.svg#x-icon"></use>
                </svg>
                X.com
              </a>
            </li>
            <li>
              <a href="https://bsky.app/profile/vite.dev" target="_blank" rel="noopener">
                <svg className="button-icon" role="presentation" aria-hidden="true">
                  <use href="/icons.svg#bluesky-icon"></use>
                </svg>
                Bluesky
              </a>
            </li>
          </ul>
        </div>
      </section>

      <div className="ticks"></div>
      <section id="spacer"></section>
    </>
  );
}

export default App;
