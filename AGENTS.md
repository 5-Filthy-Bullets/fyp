## FYP (Final Year Project)

- This project is acedamic btech final year project, which doesn't have name yet. About tech-stack: oRPC (with hono) for backend it's meant to be deployed on cloudflare-workers so keep that in consideration while implementing code, and about frontend it's React and @oRPC/client to work with our backend; db is postgresql(on neondb) ORM: drizzle.
- Add OpenAPI docs as per oRPC while writing code itself.
- Don't be shy about asking valid questions; always make informed decisions.
- Keep stuff simple and "yagni" just do as much required.
- Follow the standards of coss ui for ui and ux.
- Fonts go with IBM Plex for everything Sans, Mono, and serif.
- Project uses better-auth for both AuthN and AuthZ.
- Use zod for validation throughout the project.

## Tests:

- Audit existing tests before adding new ones. Remove tautological, redundant, implementation-coupled, and low-value tests.
- Expected values must come from an independent source of truth, never echo mocked fixtures back. Assert on recorded writes (SQL, calls) for success paths, not on queued fake rows.
- Prioritize behavioral coverage: each test must fail if the implementation is wrong (verify with mutation testing when in doubt).
- Don't optimize for test count or coverage percentage.

## Guide:

- Channel both "measure twice, cut once" and "yagni". Fight scope creep. Try to honor the dev's intent in both a minimal and realistic fashion.
- Inferred types over annotations. any is the enemy.
- Comments describe how a thing is used, and move when the code moves. To be used mostly to describe functions, not to annotate every line of behavior.
- If a rule here fights the task in front of you, say so loudly and get a human sign-off before breaking it.
- Security is important, but should not be over-indexed on, especially for dev mode/maintainer-only features.
