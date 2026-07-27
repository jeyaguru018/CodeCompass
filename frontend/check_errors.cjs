const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    try {
        const browser = await puppeteer.launch({ headless: 'new' });
        const page = await browser.newPage();
        
        page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
        page.on('pageerror', error => console.log('BROWSER ERROR:', error.message));
        page.on('requestfailed', request => console.log('BROWSER REQUEST FAILED:', request.url(), request.failure().errorText));

        await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
        
        await browser.close();
    } catch (e) {
        console.error("Puppeteer error:", e);
    }
})();
