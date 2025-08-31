const puppeteer = require('puppeteer');

async function inspectRMVPage() {
    const browser = await puppeteer.launch({
        headless: true, // Use headless mode for CLI environment
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    
    try {
        const url = 'https://rmvmassdotappt.cxmflow.com/Appointment/Index/2c052fc7-571f-4b76-9790-7e91f103c408?AccessToken=f7fb561d-7dc4-411b-b082-f29b705d26c5';
        
        console.log('Navigating to:', url);
        await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // Wait a moment for any dynamic content to load
        await page.waitForTimeout(3000);

        // Take a screenshot for debugging
        await page.screenshot({ path: 'rmv-page-debug.png', fullPage: true });
        console.log('Screenshot saved as rmv-page-debug.png');

        // Get page title
        const title = await page.title();
        console.log('Page title:', title);

        // Get all clickable elements that might be appointment slots
        const clickableElements = await page.evaluate(() => {
            const elements = [];
            
            // Look for buttons, links, divs with click handlers
            const selectors = [
                'button', 'a[href]', '[onclick]', '[data-*]', 
                '.appointment', '.slot', '.time', '.available',
                '.btn', '.button', '.book', '.select'
            ];
            
            selectors.forEach(selector => {
                try {
                    const found = document.querySelectorAll(selector);
                    found.forEach(el => {
                        if (el.offsetWidth > 0 && el.offsetHeight > 0) { // Only visible elements
                            elements.push({
                                tag: el.tagName,
                                class: el.className,
                                id: el.id,
                                text: el.textContent?.trim().substring(0, 100),
                                selector: selector
                            });
                        }
                    });
                } catch (e) {
                    // Ignore selector errors
                }
            });
            
            return elements;
        });

        console.log('\n=== Clickable Elements Found ===');
        clickableElements.forEach((el, i) => {
            console.log(`${i + 1}. ${el.tag} - Class: "${el.class}" - Text: "${el.text}"`);
        });

        // Look for form elements
        const forms = await page.evaluate(() => {
            const forms = Array.from(document.forms);
            return forms.map(form => ({
                action: form.action,
                method: form.method,
                inputs: Array.from(form.elements).map(input => ({
                    name: input.name,
                    type: input.type,
                    id: input.id,
                    className: input.className
                }))
            }));
        });

        console.log('\n=== Forms Found ===');
        forms.forEach((form, i) => {
            console.log(`Form ${i + 1}: ${form.action} (${form.method})`);
            form.inputs.forEach(input => {
                console.log(`  - ${input.type}: ${input.name} (id: ${input.id}, class: ${input.className})`);
            });
        });

        // Get page HTML structure (first 2000 chars)
        const html = await page.content();
        console.log('\n=== Page HTML (first 2000 chars) ===');
        console.log(html.substring(0, 2000));

    } catch (error) {
        console.error('Error inspecting page:', error);
    }

    await browser.close();
}

inspectRMVPage().catch(console.error);