#!/usr/bin/env bash
# Hook 1: i18n parity check
# Fires PostToolUse on Edit|Write. If the edited file is messages/{ru,en}.json,
# verify both locale files have the same key set. Exit 2 → Claude sees the error.

FILE=$(jq -r '.tool_input.file_path // empty' 2>/dev/null)

case "$FILE" in
  */messages/ru.json|*/messages/en.json|messages/ru.json|messages/en.json)
    ;;
  *)
    exit 0
    ;;
esac

cd "$(jq -r '.cwd // "."' 2>/dev/null)" || exit 0

node -e "
function keys(o, p=''){
  return Object.entries(o).flatMap(([k,v]) =>
    typeof v === 'object' && v !== null
      ? keys(v, p+k+'.')
      : [p+k]
  );
}
try {
  const ru = new Set(keys(require('./messages/ru.json')));
  const en = new Set(keys(require('./messages/en.json')));
  const missingEn = [...ru].filter(k => !en.has(k));
  const missingRu = [...en].filter(k => !ru.has(k));
  if (missingEn.length || missingRu.length) {
    console.error('⚠ i18n parity broken (CLAUDE.md §11.1):');
    if (missingEn.length) console.error('  missing in en.json:', missingEn.slice(0,5).join(', '));
    if (missingRu.length) console.error('  missing in ru.json:', missingRu.slice(0,5).join(', '));
    process.exit(2);
  }
} catch (e) {
  console.error('i18n parity check failed:', e.message);
  process.exit(0);
}
"
