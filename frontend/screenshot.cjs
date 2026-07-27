const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    try {
        const browser = await puppeteer.launch({ headless: 'new' });
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        
        console.log("Navigating to frontend...");
        await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
        
        console.log("Waiting for Auth page to load...");
        await page.waitForSelector('input[type="email"]');
        
        console.log("Clicking 'Create Account' toggle...");
        const buttons = await page.$$('button');
        let createAccountBtn;
        for (const btn of buttons) {
            const text = await page.evaluate(el => el.textContent, btn);
            if (text.includes('Create Account') && !text.includes('Sign In')) {
                createAccountBtn = btn;
            }
        }
        if (createAccountBtn) {
            await createAccountBtn.click();
            await new Promise(r => setTimeout(r, 500)); // wait for toggle
        }

        console.log("Filling form...");
        await page.type('input[type="email"]', 'newdev@company.com');
        await page.type('input[type="password"]', 'supersecret123');
        
        console.log("Submitting...");
        const submitBtns = await page.$$('button[type="submit"]');
        if (submitBtns.length > 0) {
            await submitBtns[0].click();
        }

        console.log("Waiting for navigation to dashboard...");
        try {
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 });
        } catch(e) {
            console.log("Navigation timeout. Checking for error message on page...");
        }

        const currentUrl = page.url();
        console.log("Current URL:", currentUrl);
        
        const screenshotPath = path.join('C:', 'Users', 'jeyag', '.gemini', 'antigravity', 'brain', '76a1e272-5a9d-4d0a-a017-fb8a84fba2dd', 'real_dashboard.png');
        await page.screenshot({ path: screenshotPath });
        console.log("Screenshot saved at:", screenshotPath);
        
        await browser.close();
    } catch (e) {
        console.error("Puppeteer error:", e);
    }
})();
