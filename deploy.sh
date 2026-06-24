#!/usr/bin/env bash
# Deploy Babel Book Buddy to bookbuddy.danqian.net.
#
# Builds LOCALLY (so the gitignored, generated public/data — both the books and
# the CC-CEDICT dictionary — gets copied into dist/ by `vite build`) and rsyncs
# the static build to the server. The server needs no Node, no source, and no
# `npm run seed`: it only serves the files in dist/.
#
# Prereqs on this machine: `npm run seed` + any `npm run ingest` have been run,
# so public/data/{books,dict} exist. Run from the repo root: ./deploy.sh
set -euo pipefail

HOST=personal                 # ssh host alias
TARGET=/var/www/bookbuddy     # nginx root for bookbuddy.danqian.net

echo "==> Building (tsc --noEmit + vite build)…"
npm run build

# Sanity-check that the generated data actually made it into the build, so we
# don't ship an app with an empty library or no dictionary.
if [ ! -f dist/data/books/index.json ]; then
	echo "ERROR: dist/data/books/index.json missing — did you run 'npm run seed'/'npm run ingest'?" >&2
	exit 1
fi

echo "==> Syncing dist/ -> ${HOST}:${TARGET}"
# --delete prunes old content-hashed assets from previous deploys.
# --rsync-path lets rsync write under /var/www without the dir being user-owned.
rsync -avz --delete \
	--rsync-path="sudo rsync" \
	dist/ "${HOST}:${TARGET}/"

echo "==> Reloading nginx"
ssh "${HOST}" "sudo nginx -t && sudo systemctl reload nginx"

echo "==> Done: https://bookbuddy.danqian.net"
