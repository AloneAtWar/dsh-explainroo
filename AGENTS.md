# DSH Explainroo

Independent plugin project; do not edit sibling repositories or the installed explainroo engine.

- Use `npm ci --ignore-scripts`, Node ^22.19 or >=24. Keep DSH code in peers; compile against the pinned latest prerelease.
- Read `docs/architecture.md` before changing the project store, native bridge, preview or export adapter. UI and tools share the Host service.
- Keep manual edits and locks durable, reject stale revisions, preserve narration markers and other scenes.
- Preview must not trigger paid speech generation. Voice generation is an explicit action.
- Native chat is the host's `conversation` node. Never copy the host shell or auto-send messages.
- All plugin registrations are effects. Dispose previews and owned child processes on unload.
- For behavior changes run focused tests. Before delivery run `npm run check`, inspect the actual UI and package contents. Document native Desktop installation separately from browser preview.
- Keep `.local`, `.env`, generated media, machine paths and credentials out of packages and commits. Update README and relevant docs when functionality changes.
