## FYP (Final Year Project)

This project is acedamic btech final year project, which doesn't have name yet. About tech-stack: oRPC (with hono) for backend it's meant to be deployed on cloudflare-workers so keep that in consideration while implementing code, and about frontend it's React and @oRPC/client to work with our backend; db is postgresql(on neondb) ORM: drizzle.
Don't be shy about asking valid questions; always make informed decisions.
keep stuff simple and "yagni" just do as much required.
follow the standards of coss ui for ui and ux.
fonts go with IBM Plex for everything Sans, Mono, and serif.
project uses better-auth for both AuthN and AuthZ.

## Guide:

- Channel both "measure twice, cut once" and "yagni". Fight scope creep. Try to honor the dev's intent in both a minimal and realistic fashion.
- Inferred types over annotations. any is the enemy.
- Comments describe how a thing is used, and move when the code moves. To be used mostly to describe functions, not to annotate every line of behavior.
- If a rule here fights the task in front of you, say so loudly and get a human sign-off before breaking it.
- Security is important, but should not be over-indexed on, especially for dev mode/maintainer-only features.
