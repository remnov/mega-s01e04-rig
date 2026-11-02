# rig

Keeps a lane's lights on while nobody is in it: a heartbeat every minute, a status board, and
(next) a morning digest of what ran overnight.

```sh
cp .env.example .env   # set LANE_MARKER
pnpm install
pnpm dev               # http://localhost:8787
```

Working on it with an agent: start at [AGENTS.md](AGENTS.md).

To capture the sample digest locally, use an existing absolute directory outside any Git
checkout. The command reads the local `.env`, starts rig on the chosen port, saves the real
HTTP response as `index.html`, and stops its server. It prints the path to its temporary log.

```sh
preview_dir="$(mktemp -d)"
bash scripts/export-preview.sh "$preview_dir" 8788
```

Never commit or attach the HTML, `.env`, or marker. After separate approval to publish, enable
GitHub Pages with GitHub Actions as its source and run **Digest preview** manually. For the
marked review copy, first configure the repository secret `LANE_MARKER` and select
`with_marker: true`. The workflow tests and typechecks before exporting, uploads only the HTML
from the runner's temporary directory, and deploys to the `github-pages` environment. It never
runs on push or pull request. The artifact expires after one day; the public site stays live.

After the reviewer finishes, obtain separate approval and run the same workflow with
`with_marker: false` (the default) to replace the same public URL with “no marker set”. Only
then is the preview cleanup complete ([ADR 0003](docs/adr/0003-previews-are-public-and-short-lived.md)).
