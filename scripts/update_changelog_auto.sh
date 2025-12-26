#!/usr/bin/env bash
set -euo pipefail

msg_file="${1:-}"
if [[ -z "${msg_file}" || ! -f "${msg_file}" ]]; then
  exit 0
fi

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${repo_root}" ]]; then
  exit 0
fi

changelog="${repo_root}/CHANGELOG.md"
if [[ ! -f "${changelog}" ]]; then
  exit 0
fi

commit_title="$(grep -v '^[[:space:]]*#' "${msg_file}" | sed '/^[[:space:]]*$/d' | head -n 1 || true)"
commit_title="${commit_title//$'\r'/}"
if [[ -z "${commit_title}" ]]; then
  exit 0
fi

case "${commit_title}" in
  Merge\ *|Revert\ \"*)
    exit 0
    ;;
esac

semver="patch"
if [[ "${commit_title}" == *"!"* ]] || grep -qi -- 'breaking change' "${msg_file}"; then
  semver="major"
elif [[ "${commit_title}" == feat:* ]] || [[ "${commit_title}" == feat\(* ]]; then
  semver="minor"
fi

file_count="$(git diff --cached --name-only | sed '/^[[:space:]]*$/d' | wc -l | tr -d ' ')"
timestamp="$(date '+%Y-%m-%d %H:%M')"
entry="- ${timestamp} | ${semver} | ${commit_title} (files: ${file_count})"

start_marker="<!-- auto-commit-log:start -->"
end_marker="<!-- auto-commit-log:end -->"

if ! grep -qF -- "${start_marker}" "${changelog}"; then
  tmp_file="$(mktemp)"
  awk -v start="${start_marker}" -v end="${end_marker}" '
    NR == 1 {
      print
      print ""
      print "## Auto Commit Log"
      print ""
      print start
      print end
      next
    }
    { print }
  ' "${changelog}" > "${tmp_file}"
  mv "${tmp_file}" "${changelog}"
fi

if grep -qF -- "${entry}" "${changelog}"; then
  exit 0
fi

tmp_file="$(mktemp)"
awk -v start="${start_marker}" -v entry_line="${entry}" '
  { print }
  $0 == start { print entry_line }
' "${changelog}" > "${tmp_file}"
mv "${tmp_file}" "${changelog}"

git add "${changelog}" >/dev/null 2>&1 || true
