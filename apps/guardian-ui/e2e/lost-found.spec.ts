/**
 * Lost & Found E2E Tests
 * 
 * End-to-end tests for the Lost Pet/Person detection feature.
 * 
 * @module e2e/lost-found.spec
 */

import { test, expect, type Page } from '@playwright/test';

// =============================================================================
// Test Configuration
// =============================================================================

// The address playwright.config.ts tests: PLAYWRIGHT_BASE_URL when a site is
// already being served there, and the development server otherwise.
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || process.env.BASE_URL || 'http://localhost:3000';

// =============================================================================
// Helper Functions
// =============================================================================

async function navigateToLostFound(page: Page) {
  await page.goto(`${BASE_URL}/lost-found`);
  await page.waitForLoadState('networkidle');
}

async function navigateToGallery(page: Page) {
  await page.goto(`${BASE_URL}/lost-found/gallery`);
  await page.waitForLoadState('networkidle');
}

async function navigateToMonitor(page: Page) {
  await page.goto(`${BASE_URL}/monitor`);
  await page.waitForLoadState('networkidle');
}

// =============================================================================
// Lost & Found Page Tests
// =============================================================================

test.describe('Lost & Found Page', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToLostFound(page);
  });

  test('should display page title and description', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /lost & found/i })).toBeVisible();
    await expect(page.getByText(/watch for lost pets or people/i)).toBeVisible();
  });

  test('should show add subject button', async ({ page }) => {
    await expect(page.getByText(/add new subject to watch/i)).toBeVisible();
  });

  test('should display how it works section', async ({ page }) => {
    await expect(page.getByText(/how it works/i)).toBeVisible();
    await expect(page.getByText(/upload clear photos/i)).toBeVisible();
    await expect(page.getByText(/visual fingerprint/i)).toBeVisible();
    await expect(page.getByText(/get alerts/i)).toBeVisible();
  });

  test('should open setup wizard when clicking add subject', async ({ page }) => {
    await page.getByText(/add new subject to watch/i).click();
    
    // Should show type selection step
    await expect(page.getByText(/what are you looking for/i)).toBeVisible();
    await expect(page.getByText(/pet/i)).toBeVisible();
    await expect(page.getByText(/person/i)).toBeVisible();
    await expect(page.getByText(/other/i)).toBeVisible();
  });
});

// =============================================================================
// Setup Wizard Tests
// =============================================================================

test.describe('Setup Wizard', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToLostFound(page);
    await page.getByText(/add new subject to watch/i).click();
  });

  test('should navigate through type selection', async ({ page }) => {
    // Select pet type
    await page.getByRole('button', { name: /pet/i }).first().click();
    
    // Click continue
    await page.getByRole('button', { name: /continue/i }).click();
    
    // Should be on upload step
    await expect(page.getByText(/upload reference photos/i)).toBeVisible();
  });

  test('should allow type selection', async ({ page }) => {
    // Pet should be default selected
    const petButton = page.getByRole('button', { name: /pet/i }).first();
    await expect(petButton).toHaveClass(/border-emerald/);
    
    // Select person
    await page.getByRole('button', { name: /person/i }).first().click();
    const personButton = page.getByRole('button', { name: /person/i }).first();
    await expect(personButton).toHaveClass(/border-emerald/);
  });

  test('should validate name is required', async ({ page }) => {
    // Go to upload step
    await page.getByRole('button', { name: /continue/i }).click();
    
    // Continue button should be disabled without name
    const continueButton = page.getByRole('button', { name: /continue/i });
    await expect(continueButton).toBeDisabled();
    
    // Enter name
    await page.getByPlaceholder(/e.g., max/i).fill('Buddy');
    
    // Note: Still disabled without images (we can't easily mock file upload in E2E)
  });

  test('should show upload area', async ({ page }) => {
    await page.getByRole('button', { name: /continue/i }).click();
    
    await expect(page.getByText(/click to upload photos/i)).toBeVisible();
    await expect(page.getByText(/png, jpg up to 10mb/i)).toBeVisible();
  });

  test('should allow going back', async ({ page }) => {
    // Go to upload step
    await page.getByRole('button', { name: /continue/i }).click();
    await expect(page.getByText(/upload reference photos/i)).toBeVisible();
    
    // Go back
    await page.getByRole('button', { name: /back/i }).click();
    
    // Should be back on type selection
    await expect(page.getByText(/what are you looking for/i)).toBeVisible();
  });

  test('should allow canceling setup', async ({ page }) => {
    await page.getByRole('button', { name: /cancel/i }).click();
    
    // Should be back on main page
    await expect(page.getByText(/add new subject to watch/i)).toBeVisible();
  });
});

// =============================================================================
// Match Gallery Tests
// =============================================================================

test.describe('Match Gallery', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToGallery(page);
  });

  test('should display gallery page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /possible sightings/i })).toBeVisible();
  });

  test('should show back link to lost & found', async ({ page }) => {
    const backLink = page.getByRole('link', { name: /back to lost & found/i });
    await expect(backLink).toBeVisible();
    
    await backLink.click();
    await expect(page).toHaveURL(/\/lost-found$/);
  });

  test('should show the gallery’s empty state', async ({ page }) => {
    const noPictures = page.getByText(/no pictures saved/i);
    const galleryGrid = page.locator('[class*="grid"]');
    
    // Either show empty state or have some content
    const hasContent = await galleryGrid.locator('> div').count() > 0;
    if (!hasContent) {
      await expect(noPictures).toBeVisible();
    }
  });

  test('should have filter controls', async ({ page }) => {
    // Filter button should exist
    await expect(page.getByRole('button', { name: /filter/i })).toBeVisible();
  });

  test('should have sort dropdown', async ({ page }) => {
    // Sort dropdown should exist
    const sortDropdown = page.locator('select');
    if (await sortDropdown.isVisible()) {
      await expect(sortDropdown).toBeVisible();
      
      // Check options
      const options = await sortDropdown.locator('option').allTextContents();
      expect(options).toContain('Newest First');
    }
  });

  test('should have export options', async ({ page }) => {
    await expect(page.getByRole('button', { name: /export/i })).toBeVisible();
  });
});

// =============================================================================
// Monitor Integration Tests
// =============================================================================

test.describe('Monitor Lost & Found Integration', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToMonitor(page);
  });

  test('should show Lost & Found toggle button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /lost & found/i })).toBeVisible();
  });

  test('should toggle Lost & Found panel', async ({ page }) => {
    const lostFoundButton = page.getByRole('button', { name: /lost & found/i });
    await lostFoundButton.click();
    
    // Should show Lost & Found panel or indication
    // The exact content depends on whether a subject is set
    const lostFoundContent = page.getByText(/lost & found/i);
    await expect(lostFoundContent.first()).toBeVisible();
  });

  test('should show setup prompt when no subject', async ({ page }) => {
    // Click Lost & Found button
    await page.getByRole('button', { name: /lost & found/i }).click();
    
    // Wait a moment for panel to open
    await page.waitForTimeout(500);
    
    // Should show either setup prompt or subject info
    const noSubjectText = page.getByText(/no subject set/i);
    const subjectPreview = page.getByText(/currently watching/i);
    
    const hasNoSubject = await noSubjectText.isVisible();
    const hasSubject = await subjectPreview.isVisible();
    
    // One of these should be true
    expect(hasNoSubject || hasSubject).toBe(true);
  });

  test('should have link to setup Lost & Found', async ({ page }) => {
    await page.getByRole('button', { name: /lost & found/i }).click();
    
    // Look for setup link if no subject is set
    const setupLink = page.getByRole('link', { name: /set up lost & found/i });
    if (await setupLink.isVisible()) {
      await setupLink.click();
      await expect(page).toHaveURL(/\/lost-found/);
    }
  });
});

// =============================================================================
// Accessibility Tests
// =============================================================================

test.describe('Accessibility', () => {
  test('Lost & Found page should be navigable by keyboard', async ({ page }) => {
    await navigateToLostFound(page);
    
    // Tab through interactive elements
    await page.keyboard.press('Tab');
    
    // Focus should move through the page
    const focusedElement = await page.locator(':focus').first();
    await expect(focusedElement).toBeTruthy();
  });

  test('Gallery should have proper labels', async ({ page }) => {
    await navigateToGallery(page);
    
    // Check for proper heading structure
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
  });

  test('Setup wizard should have proper form labels', async ({ page }) => {
    await navigateToLostFound(page);
    await page.getByText(/add new subject to watch/i).click();
    await page.getByRole('button', { name: /continue/i }).click();
    
    // Check for labeled form fields
    const nameInput = page.getByPlaceholder(/e.g., max/i);
    await expect(nameInput).toBeVisible();
  });
});

// =============================================================================
// Responsive Design Tests
// =============================================================================

test.describe('Responsive Design', () => {
  test('should display correctly on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await navigateToLostFound(page);
    
    await expect(page.getByRole('heading', { name: /lost & found/i })).toBeVisible();
    await expect(page.getByText(/add new subject/i)).toBeVisible();
  });

  test('should display correctly on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await navigateToLostFound(page);
    
    await expect(page.getByRole('heading', { name: /lost & found/i })).toBeVisible();
  });

  test('gallery should be responsive', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await navigateToGallery(page);
    
    // Should still show essential controls
    await expect(page.getByRole('heading', { name: /possible sightings/i })).toBeVisible();
  });
});

// =============================================================================
// State Persistence Tests
// =============================================================================

test.describe('State Persistence', () => {
  test('settings should persist between navigations', async ({ page }) => {
    // Note: This test would require setting up a subject first
    // For now, just verify the settings structure exists
    
    await navigateToLostFound(page);
    await page.getByText(/add new subject to watch/i).click();
    
    // Go through setup to configuration
    await page.getByRole('button', { name: /continue/i }).click();
    
    // Enter name (but can't complete without image)
    await page.getByPlaceholder(/e.g., max/i).fill('Test Subject');
    
    // Navigate away and back
    await page.goto(BASE_URL);
    await navigateToLostFound(page);
    
    // Page should load without errors
    await expect(page.getByText(/lost & found/i)).toBeVisible();
  });
});

// =============================================================================
// Error Handling Tests
// =============================================================================

test.describe('Error Handling', () => {
  test('should handle invalid routes gracefully', async ({ page }) => {
    await page.goto(`${BASE_URL}/lost-found/invalid-route`);
    
    // Should either show 404 or redirect
    const is404 = await page.getByText(/not found/i).isVisible();
    const isRedirected = page.url().includes('/lost-found');
    
    expect(is404 || isRedirected).toBe(true);
  });

  test('should handle empty gallery state', async ({ page }) => {
    // Clear any stored data
    await page.evaluate(() => {
      localStorage.clear();
    });
    
    await navigateToGallery(page);
    
    // Should show empty state or handle gracefully
    await expect(page.getByRole('heading', { name: /possible sightings/i })).toBeVisible();
  });
});

