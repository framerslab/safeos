/**
 * @jest-environment jsdom
 */

/**
 * Self-hosting steps in the server settings panel
 *
 * The "Deploy your own server" section once told people to pipe a setup script
 * from a placeholder GitHub account into bash. This renders the panel, opens
 * that section as a person would, and holds it to two rules: no command piped
 * into a shell, and no GitHub link to an account other than framerslab.
 */

import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import type { BackendStatusContextValue } from '@/contexts/BackendStatusContext';
// jest.mock below is hoisted above this import, so the panel reads the mocked context.
import { BackendSettings } from '@/components/BackendSettings';

const mockContextValue: BackendStatusContextValue = {
  status: {
    api: 'disconnected',
    websocket: 'disconnected',
    ollama: 'disconnected',
    mode: 'local-only',
    disabledFeatures: [],
    lastConnected: null,
    error: null,
  },
  config: { apiUrl: '', wsUrl: '', ollamaUrl: '', configured: false },
  updateConfig: () => {},
  testConnection: async () => false,
  retry: () => {},
  isFeatureAvailable: () => false,
  isLocalOnly: true,
  isConnected: false,
};

jest.mock('@/contexts/BackendStatusContext', () => ({
  useBackendStatus: () => mockContextValue,
}));

// "| bash", "| sh", "| sudo bash", "| zsh" and the like.
const PIPED_INTO_SHELL = /\|\s*(sudo\s+(-\S+\s+)*)?(ba|z|k|da|c)?sh\b/i;
// The account part of a github.com or raw.githubusercontent.com address.
const GITHUB_ACCOUNT = /(?:^|[/.@\s"'])(?:github\.com|githubusercontent\.com)\/([^/\s"'<>?#]+)/gi;

function openDeploySection() {
  const view = render(<BackendSettings />);
  const toggle = view.getByRole('button', { name: /Deploy your own server/ });
  fireEvent.click(toggle);
  // The section is the toggle's bordered wrapper; its body renders once open.
  const section = toggle.parentElement as HTMLElement;
  expect(section.textContent).toMatch(/Linode/);
  return section;
}

function githubAccounts(text: string): string[] {
  return Array.from(text.matchAll(GITHUB_ACCOUNT), (m) => m[1].toLowerCase());
}

afterEach(cleanup);

describe('Deploy your own server section', () => {
  it('shows no command piped into a shell', () => {
    const section = openDeploySection();
    expect(section.textContent ?? '').not.toMatch(PIPED_INTO_SHELL);
    for (const pre of Array.from(section.querySelectorAll('pre, code'))) {
      expect(pre.textContent ?? '').not.toMatch(PIPED_INTO_SHELL);
    }
  });

  it('links to no GitHub account other than framerslab', () => {
    const section = openDeploySection();
    const hrefs = Array.from(section.querySelectorAll('a[href]'), (a) => a.getAttribute('href') ?? '');
    const accounts = githubAccounts([section.textContent ?? '', ...hrefs].join(' '));
    expect(accounts.filter((a) => a !== 'framerslab')).toEqual([]);
  });

  it('links the deployment guide in the framerslab repository', () => {
    const section = openDeploySection();
    const hrefs = Array.from(section.querySelectorAll('a[href]'), (a) => a.getAttribute('href'));
    expect(hrefs).toContain('https://github.com/framerslab/safeos/blob/master/docs/DEPLOYMENT.md');
  });

  it('the checks catch the old setup line', () => {
    // The line the section carried before; the rules above must reject it.
    const old =
      'curl -fsSL https://raw.githubusercontent.com/yourusername/super-cloud-mcps/main/packages/safeos/scripts/linode-setup.sh | bash';
    expect(old).toMatch(PIPED_INTO_SHELL);
    expect(githubAccounts(old)).toEqual(['yourusername']);
  });
});
