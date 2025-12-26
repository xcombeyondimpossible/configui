import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('XCOM Configurator UI', () => {
    test.beforeEach(async ({ page }) => {
        page.on('console', msg => console.log(`BROWSER [${msg.type()}]: ${msg.text()}`));
    });

    test('should load the app and transition to editor mode on file upload', async ({ page }) => {
        await page.goto('http://localhost:3000');

        await expect(page.locator('h1')).toContainText('XCOM Strategy AI Configurator');

        // Click Load Defaults
        const loadBtn = page.locator('button:has-text("Load Defaults")');
        await loadBtn.click();

        await expect(page.locator('.sidebar')).toBeVisible();
        await expect(page.locator('.preview-pane')).toBeVisible();
    });

    test('should update simulation results when data is present', async ({ page }) => {
        await page.goto('http://localhost:3000');

        // Click Load Defaults
        const loadBtn = page.locator('button:has-text("Load Defaults")');
        await loadBtn.click();

        // Check if pods are rolled (Default config has pods)
        const podCards = page.locator('.pod-card');
        await expect(podCards.first()).toBeVisible();
    });

    test('should switch sidebar tabs when clicked', async ({ page }) => {
        await page.goto('http://localhost:3000');

        // Click Load Defaults
        const loadBtn = page.locator('button:has-text("Load Defaults")');
        await loadBtn.click();

        // Check initial active tab
        const globalTab = page.locator('.category-btn:has-text("Global Settings")');
        await expect(globalTab).toHaveClass(/active/);

        // Click on "Pod Definitions" tab
        const podTab = page.locator('.category-btn:has-text("Pod Definitions")');
        await podTab.click();

        // Check if the tab is active
        await expect(podTab).toHaveClass(/active/);

        // Check if another tab is NOT active
        await expect(globalTab).not.toHaveClass(/active/);
    });
});
