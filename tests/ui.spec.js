import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('XCOM Configurator UI', () => {
    test.beforeEach(async ({ page }) => {
        page.on('console', msg => console.log(`BROWSER [${msg.type()}]: ${msg.text()}`));
    });

    test('should load the app and transition to editor mode on file upload', async ({ page }) => {
        const filePath = `file://${path.resolve('docs/index.html')}`;
        await page.goto(filePath);

        await expect(page.locator('h1')).toContainText('XCOM Strategy AI Configurator');

        await page.evaluate(() => {
            const app = document.querySelector('#app').__vue_app__._instance.proxy;
            const strat = `[XComStrategyAIMutator.XGStrategyAI_Mod]
AlwaysSpawnAtLeastOneMainAlien=true
AbductionPodNumbers=(MinPods=3,MaxPods=3)
AbductionPodTypes=(ID=EPodTypeMod_Soldier,TypeChance=100)
PossibleSoldiers[0]=(MainAlien=eChar_Sectoid,PodChance=100,MinAliens=4,MaxAliens=4)`;
            app.files.strategy = strat;
            app.confirmInit();
        });

        await expect(page.locator('.sidebar')).toBeVisible();
        await expect(page.locator('.preview-pane')).toBeVisible();
    });

    test('should update simulation results when data is present', async ({ page }) => {
        const filePath = `file://${path.resolve('docs/index.html')}`;
        await page.goto(filePath);

        await page.evaluate(() => {
            const app = document.querySelector('#app').__vue_app__._instance.proxy;
            const strat = `[XComStrategyAIMutator.XGStrategyAI_Mod]
AbductionPodNumbers=(MinPods=3,MaxPods=3)
AbductionPodTypes=(ID=EPodTypeMod_Soldier,TypeChance=100)
PossibleSoldiers[0]=(MainAlien=eChar_Sectoid,PodChance=100,MinAliens=4,MaxAliens=4)`;
            app.files.strategy = strat;
            app.confirmInit();
        });

        // The default mission is Abduction. 3 pods should be rolled.
        const podCards = page.locator('.pod-card');
        await expect(podCards).toHaveCount(3);
    });
});
