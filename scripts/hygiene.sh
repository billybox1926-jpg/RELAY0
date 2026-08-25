#!/usr/bin/env bash
set -euo pipefail

failures=0

report_failure() {
  echo "hygiene: $1" >&2
  failures=$((failures + 1))
}

check_required_files() {
  local required_files=(
    README.md
    LICENSE
    CONTRIBUTING.md
    SECURITY.md
    CODE_OF_CONDUCT.md
    CHANGELOG.md
    .editorconfig
    .gitattributes
    .gitignore
    docs/ARCHITECTURE.md
    docs/DEVEX.md
    docs/REPOSITORY_STANDARDS.md
    config/.env.example
  )

  for file in "${required_files[@]}"; do
    if [[ ! -f "$file" ]]; then
      report_failure "missing required file: $file"
    fi
  done
}

check_shell_syntax() {
  local script
  while IFS= read -r -d '' script; do
    bash -n "$script" || report_failure "shell syntax failed: $script"
  done < <(find . -type f -name '*.sh' -not -path './.git/*' -not -path './node_modules/*' -not -path './dist/*' -print0)
}

check_merge_markers() {
  # Real conflict markers are exactly 7 chars at the START of a line and are
  # followed by end-of-line or a space. Anchoring this way avoids false hits on
  # BrightScript comment banners (' =======...) and markdown rules.
  local tmp_file
  tmp_file="$(mktemp)"
  if git grep -nE '^(<{7}|={7}|>{7})( |$)' -- . ':!.git' > "$tmp_file" 2>/dev/null; then
    cat "$tmp_file" >&2
    rm -f "$tmp_file"
    report_failure "possible unresolved merge markers found"
  else
    rm -f "$tmp_file"
  fi
}

check_manifest() {
  # Roku requires a manifest at the package root with these keys.
  if [[ ! -f manifest ]]; then
    report_failure "missing required file: manifest (Roku package root)"
    return
  fi

  local key
  for key in title major_version minor_version build_version; do
    if ! grep -Eq "^${key}=" manifest; then
      report_failure "manifest missing required key: ${key}"
    fi
  done

  # Version keys must be integers or the channel will not install.
  for key in major_version minor_version build_version; do
    local value
    value="$(grep -E "^${key}=" manifest | head -n 1 | cut -d= -f2- | tr -d '\r')"
    if [[ -n "$value" && ! "$value" =~ ^[0-9]+$ ]]; then
      report_failure "manifest ${key} must be an integer, got: '${value}'"
    fi
  done

  # A BOM in the manifest makes Roku reject the first key outright.
  if [[ "$(head -c 3 manifest | od -An -tx1 | tr -d ' \n')" == "efbbbf" ]]; then
    report_failure "manifest has a UTF-8 BOM; Roku will not parse the first key"
  fi
}

check_roku_layout() {
  # Entry point must live at source/main.brs with a Main() sub.
  if [[ ! -f source/main.brs ]]; then
    report_failure "missing Roku entry point: source/main.brs"
  elif ! grep -Eiq '^[[:space:]]*sub[[:space:]]+Main[[:space:]]*\(' source/main.brs; then
    report_failure "source/main.brs does not define sub Main()"
  fi

  if [[ ! -d components ]]; then
    report_failure "missing components/ directory"
  fi
}

check_markdown_headings() {
  local file first_line
  while IFS= read -r -d '' file; do
    first_line="$(head -n 1 "$file")"
    if [[ "$first_line" != '#'* && "$first_line" != '---' ]]; then
      report_failure "markdown file should start with a heading or front matter: $file"
    fi
  done < <(find . -type f -name '*.md' -not -path './.git/*' -not -path './node_modules/*' -not -path './dist/*' -print0)
}

check_required_files
check_shell_syntax
check_merge_markers
check_markdown_headings
check_manifest
check_roku_layout

if [[ "$failures" -gt 0 ]]; then
  echo "Repository hygiene checks failed: $failures issue(s)." >&2
  exit 1
fi

echo "Repository hygiene checks passed."
