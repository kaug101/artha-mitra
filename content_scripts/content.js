// content_scripts/content.js

// This file is the bridge to the live webpage content for features like
// "Re-check Numbers" (Level II data/scraping) and "Select Ticker".

// --- CORE MESSAGE LISTENER ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "recheckNumbers") {
        console.log(`[Artha-Mitra Content Script] Initiating Level II Data check on URL: ${window.location.href}`);
        
        // --- Mock Scraping/Check Logic ---
        const livePrice = (Math.random() * 500 + 100).toFixed(2);
        const bidAskSpread = `Bid: $${(livePrice - 0.05).toFixed(2)}, Ask: $${(livePrice + 0.05).toFixed(2)}`;

        console.log(`Artha-Mitra: Live Data Check Complete! Price Scraped: $${livePrice}`);

        sendResponse({
            status: "success",
            livePrice: livePrice,
            bidAskSpread: bidAskSpread,
            message: `Mock live data successfully fetched.`
        });
        
        return true; 
    }
    
    return true; // Keep listener open for other potential messages
});
