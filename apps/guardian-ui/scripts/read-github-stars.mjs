#!/usr/bin/env node
/**
 * Reads how many people have starred the repository, once, before the site
 * is built, and hands the build two values: the count and the day it was
 * counted. The pages are written with them, so a visitor's browser asks
 * GitHub nothing (src/lib/github-stars.ts).
 *
 *   node scripts/read-github-stars.mjs
 *
 * In a workflow the two values are appended to the file GITHUB_ENV names, so
 * the build step that follows has them:
 *
 *   NEXT_PUBLIC_GITHUB_STARS=<count>
 *   NEXT_PUBLIC_GITHUB_STARS_DATE=<YYYY-MM-DD>
 *
 * Outside a workflow the two lines are printed instead, and they are all of
 * its standard output: the sentence with the count goes to standard error.
 * Export them only when they were printed, since a bare `export` lists the
 * whole environment:
 *
 *   stars="$(node scripts/read-github-stars.mjs)"
 *   if [ -n "$stars" ]; then export $stars; fi
 *
 * A star count never holds a build. When GitHub does not answer within ten
 * seconds, answers with an error, or answers with anything but a whole number
 * above zero, the script writes a warning and no value, and ends with
 * success: the pages then show the link's word alone.
 *
 * It needs no token: the repository is public. When the workflow hands it
 * its own token (GITHUB_TOKEN) the request carries it, because a request
 * without one is counted against the runner's shared address and can be
 * refused. The token is never printed.
 *
 * SAFEOS_STARS_URL replaces the address asked, for the tests.
 */
import { appendFileSync } from 'node:fs';

const REPOSITORY = 'framerslab/safeos';
const ADDRESS = process.env.SAFEOS_STARS_URL || `https://api.github.com/repos/${REPOSITORY}`;
const WAIT_MS = 10_000;

/** A warning in the build's log; an annotation on the run when in a workflow. */
function warn(reason) {
  const line = `The star count was not read: ${reason}. The pages show the GitHub link with no count.`;
  console.warn(process.env.GITHUB_ACTIONS ? `::warning title=GitHub star count::${line}` : `Warning: ${line}`);
}

/** The count GitHub gives, or a sentence that says why there is none. */
async function readCount() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'safeos-site-build',
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(ADDRESS, { headers, signal: AbortSignal.timeout(WAIT_MS) });
  } catch (error) {
    const late = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    return { reason: late ? `GitHub did not answer within ${WAIT_MS / 1000} seconds` : 'GitHub could not be reached' };
  }
  if (!response.ok) return { reason: `GitHub answered ${response.status}` };

  let body;
  try {
    body = await response.json();
  } catch {
    return { reason: 'GitHub answered with something that is not JSON' };
  }
  const count = body?.stargazers_count;
  if (!Number.isSafeInteger(count) || count < 0) return { reason: 'the answer holds no whole number of stars' };
  if (count === 0) return { reason: 'the repository has no star' };
  if (count > 999_999_999) return { reason: 'the answer holds a number too large to be a count' };
  return { count };
}

async function main() {
  const { count, reason } = await readCount();
  if (reason) {
    warn(reason);
    return;
  }
  const day = new Date().toISOString().slice(0, 10);
  const lines = `NEXT_PUBLIC_GITHUB_STARS=${count}\nNEXT_PUBLIC_GITHUB_STARS_DATE=${day}\n`;
  const sentence = `${count} ${count === 1 ? 'star' : 'stars'} on ${REPOSITORY}, counted ${day}.`;
  if (process.env.GITHUB_ENV) {
    try {
      appendFileSync(process.env.GITHUB_ENV, lines);
    } catch {
      warn('the two values could not be handed to the build');
      return;
    }
    console.log(sentence);
  } else {
    // The output is the two lines to set and nothing else.
    process.stdout.write(lines);
    console.error(sentence);
  }
}

// Whatever goes wrong, the build goes on without a count.
main()
  .catch(() => warn('the read ended early'))
  .finally(() => {
    process.exitCode = 0;
  });
