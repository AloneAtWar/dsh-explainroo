# SQLite demo

An unofficial SQLite 3.53.4 demo using example bakery orders. The SQL and
results were captured with the official Linux CLI on October 3, 2026.
The video shows excerpts, with the long STRICT statement and error wrapped
at spaces. The first orders view is a summary of the example data.

This revision uses 40px terminal text and omits earlier terminal history.
The original 24px text was sharp in 1080p but too small in Reddit's 480p copy.

```bash
node bin/explainroo.js check examples/sqlite-demo --view-width 854
node bin/explainroo.js still examples/sqlite-demo --scale 0.4448
node bin/explainroo.js render examples/sqlite-demo
node bin/explainroo.js verify examples/sqlite-demo
```

Review the small stills and the platform's actual upload before sharing it.
The size check is a heuristic; it cannot control streaming quality or codecs.
