#!/bin/sh
# Mise en ligne complète du tableau de bord, dans le bon ordre :
#   1. vérifications (branche main, rien de non commité, tests)
#   2. scripts Google (apps-script/*) modifiés depuis leur dernière mise en ligne : clasp push (+ nouvelle version du déploiement web)
#   3. Worker Cloudflare (wrangler deploy)
#   4. tableau de bord : git push origin main (GitHub Pages, en ligne en 1 à 5 min)
# Usage : npm run deploy
set -e
cd "$(dirname "$0")/.."

[ "$(git branch --show-current)" = "main" ] || { echo "✗ Pas sur la branche main"; exit 1; }
git diff --quiet && git diff --cached --quiet || { echo "✗ Modifications non commitées : commite d'abord"; exit 1; }

for t in tests/*.test.js; do node "$t" >/dev/null 2>&1 || { echo "✗ Test en échec : $t (node $t pour le détail)"; exit 1; }; done
echo "✓ Tests"

for dir in apps-script/*/; do
  name=$(basename "$dir")
  [ -f "$dir.clasp.json" ] || continue
  tag="deploy-$name"
  if git rev-parse -q --verify "refs/tags/$tag" >/dev/null && git diff --quiet "$tag" HEAD -- "$dir"; then
    echo "· Script Google $name : inchangé"; continue
  fi
  (cd "$dir" && npx clasp push --force >/dev/null)
  if [ -f "$dir/DEPLOIEMENT" ]; then
    (cd "$dir" && npx clasp update-deployment "$(cat DEPLOIEMENT)" -d "$(git log -1 --format=%h) $(git log -1 --format=%s | cut -c1-80)" >/dev/null)
    echo "✓ Script Google $name : poussé + nouvelle version du déploiement web (même URL)"
  else
    echo "✓ Script Google $name : poussé (pas de déploiement web)"
  fi
  git tag -f "$tag" >/dev/null
done

npx wrangler deploy 2>&1 | grep -E "Current Version ID|ERROR|✘" || true
echo "✓ Worker"

git push -q origin main
echo "✓ Tableau de bord poussé (en ligne dans 1 à 5 min)"
