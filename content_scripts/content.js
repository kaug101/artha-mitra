// content_scripts/content.js

// This file is the bridge to the live webpage content for features like
// "Re-check Numbers" (Level II data/scraping).

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "recheckNumbers") {
        console.log(`[Artha-Mitra Content Script] Initiating Level II Data check on URL: ${window.location.href}`);
        
        // --- Mock Scraping/Check Logic ---
        // In a real scenario, this would involve complex DOM querying (document.querySelector)
        // to scrape live bid/ask data from a financial website the user is viewing.

        const livePrice = (Math.random() * 500 + 100).toFixed(2);
        const bidAskSpread = `Bid: $${(livePrice - 0.05).toFixed(2)}, Ask: $${(livePrice + 0.05).toFixed(2)}`;

        // Display a visual cue on the page (optional, but good for demos)
        alert(`Artha-Mitra: Live Data Check Complete!\nPrice Scraped: $${livePrice}`);

        // Send the mock live data back to the background worker
        sendResponse({
            status: "success",
            livePrice: livePrice,
            bidAskSpread: bidAskSpread,
            message: `Mock live data successfully fetched and alert displayed.`
        });
        
        return true; // Important: Keeps the message channel open for the async response
    }
});
