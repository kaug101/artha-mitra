// content_scripts/content.js

// This file is the bridge to the live webpage content.

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "recheckNumbers") {
        console.log(`[Artha-Mitra Content Script] Initiating Level II Data check on URL: ${window.location.href}`);
        
        // --- Mock Scraping/Check Logic ---
        const livePrice = getLivePriceFromPage() || 'N/A';
        const bidAskSpread = getBidAskSpread() || 'N/A';

        // Send the mock live data back to the background worker
        sendResponse({
            status: "success",
            livePrice: livePrice,
            bidAskSpread: bidAskSpread,
            message: `Mock data successfully fetched from page: Price ${livePrice}`
        });
        
        return true; // Keep the message channel open for async response
    }
});

// Mock functions to simulate reading data from the page's DOM
function getLivePriceFromPage() {
    // In a real extension, you would use document.querySelector to find the price element
    // e.g., document.querySelector('.current-price-display').textContent
    return Math.floor(Math.random() * 500) + 100 + Math.random().toFixed(2); 
}

function getBidAskSpread() {
    // Mock a small bid-ask spread
    const bid = (Math.random() * 0.1).toFixed(2);
    const ask = (Math.random() * 0.1).toFixed(2);
    return `Bid: $${bid}, Ask: $${ask}`;
}
