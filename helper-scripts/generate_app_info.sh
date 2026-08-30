#!/usr/bin/env bash

set -o pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." &>/dev/null && pwd)"
cd "${SCRIPT_DIR}" || exit 1

APP_INFO="data/web/inc/app_info.inc.php"

MAILCOW_GIT_OWNER="glazastov"
MAILCOW_GIT_REPO="mail-encrypted"
MAILCOW_GIT_URL="https://github.com/${MAILCOW_GIT_OWNER}/${MAILCOW_GIT_REPO}"

MAILCOW_UPSTREAM_OWNER="${MAILCOW_UPSTREAM_OWNER:-mailcow}"
MAILCOW_UPSTREAM_REPO="${MAILCOW_UPSTREAM_REPO:-mailcow-dockerized}"
MAILCOW_UPSTREAM_URL="https://github.com/${MAILCOW_UPSTREAM_OWNER}/${MAILCOW_UPSTREAM_REPO}"
MAILCOW_UPSTREAM_BRANCH="${MAILCOW_UPSTREAM_BRANCH:-master}"

BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"

if [ "${BRANCH}" == "master" ]; then
  mailcow_git_version=$(git describe --tags "$(git rev-list --tags --max-count=1)" 2>/dev/null)
  [ -z "${mailcow_git_version}" ] && mailcow_git_version=$(git rev-parse --short HEAD)
elif [ "${BRANCH}" == "nightly" ]; then
  mailcow_git_version=$(git rev-parse --short "$(git rev-parse @{upstream})")
else
  mailcow_git_version=$(git rev-parse --short HEAD)
fi

mailcow_git_commit=$(git rev-parse "origin/${BRANCH}" 2>/dev/null)
mailcow_git_commit_date=$(git log -1 --format=%ci "origin/${BRANCH}" 2>/dev/null)
if [ -z "${mailcow_git_commit}" ]; then
  echo -e "\e[33mCannot determine the current git repository version...\e[0m"
  mailcow_git_commit=""
  mailcow_git_commit_date=""
fi

mailcow_git_head_commit=$(git rev-parse HEAD)

mailcow_upstream_base_commit=""
if git fetch --no-tags --quiet "${MAILCOW_UPSTREAM_URL}" "${MAILCOW_UPSTREAM_BRANCH}" 2>/dev/null; then
  mailcow_upstream_base_commit=$(git merge-base HEAD FETCH_HEAD 2>/dev/null)
else
  echo -e "\e[33mCould not reach ${MAILCOW_UPSTREAM_URL}, skipping upstream base detection...\e[0m"
fi

cat > "${APP_INFO}" <<PHP
<?php
  \$MAILCOW_GIT_VERSION="${mailcow_git_version}";
  \$MAILCOW_LAST_GIT_VERSION="";
  \$MAILCOW_GIT_OWNER="${MAILCOW_GIT_OWNER}";
  \$MAILCOW_GIT_REPO="${MAILCOW_GIT_REPO}";
  \$MAILCOW_GIT_URL="${MAILCOW_GIT_URL}";
  \$MAILCOW_GIT_COMMIT="${mailcow_git_commit}";
  \$MAILCOW_GIT_COMMIT_DATE="${mailcow_git_commit_date}";
  \$MAILCOW_GIT_HEAD_COMMIT="${mailcow_git_head_commit}";
  \$MAILCOW_UPSTREAM_OWNER="${MAILCOW_UPSTREAM_OWNER}";
  \$MAILCOW_UPSTREAM_REPO="${MAILCOW_UPSTREAM_REPO}";
  \$MAILCOW_UPSTREAM_BASE_COMMIT="${mailcow_upstream_base_commit}";
  \$MAILCOW_BRANCH="${BRANCH}";
  \$MAILCOW_UPDATEDAT=$(date +%s);
?>
PHP

echo -e "\e[32mWrote ${APP_INFO} (version ${mailcow_git_version}, branch ${BRANCH})\e[0m"
