// popup/popup.js

const API_KEY_STORAGE_KEY = 'geminiCloudApiKey';

// --- Function to Load Key Status on Popup Open ---
async function loadApiKeyStatus() {
    const statusElement = document.getElementById('keyStatus');
    const inputElement = document.getElementById('geminiApiKeyInput');

    try {
        const result = await chrome.storage.local.get(API_KEY_STORAGE_KEY);
        const storedKey = result[API_KEY_STORAGE_KEY];

        if (storedKey) {
            statusElement.textContent = 'Status: Cloud API Key is saved and ready.';
            statusElement.style.color = 'green';
            inputElement.placeholder = 'Key is saved (Click Save to update)';
        } else {
            statusElement.textContent = 'Status: Cloud API Key is missing. Hybrid mode disabled.';
            statusElement.style.color = 'red';
            inputElement.placeholder = 'Enter Gemini Cloud API Key';
        }
    } catch (e) {
        console.error("Error loading API key status:", e);
        statusElement.textContent = 'Error loading key status.';
        statusElement.style.color = 'red';
    }
}

// --- Event Listener for Saving Key ---
document.getElementById('saveApiKeyButton').addEventListener('click', async () => {
    const inputElement = document.getElementById('geminiApiKeyInput');
    const key = inputElement.value.trim();
    const statusElement = document.getElementById('keyStatus');

    if (key) {
        await chrome.storage.local.set({ [API_KEY_STORAGE_KEY]: key });
        inputElement.value = ''; // Clear input after saving
        loadApiKeyStatus();
    } else {
        statusElement.textContent = 'Error: Please enter a valid key.';
        statusElement.style.color = 'orange';
    }
});

// Load the status when the DOM content is loaded
document.addEventListener('DOMContentLoaded', loadApiKeyStatus);

// --- Analyze Button Logic ---
document.getElementById('analyzeButton').addEventListener('click', () => {
    const ticker = document.getElementById('tickerInput').value.toUpperCase().trim();
    if (!ticker) {
        alert('Please enter a stock ticker.');
        return;
    }

    document.getElementById('results').style.display = 'none';
    document.getElementById('loading').style.display = 'block';
    
    // Send message to background.js to start valuation
    chrome.runtime.sendMessage({ action: "runValuation", ticker: ticker }, (response) => {
        document.getElementById('loading').style.display = 'none';
        
        if (chrome.runtime.lastError) {
            console.error("Error message from background:", chrome.runtime.lastError.message);
            alert("An error occurred. Check the service worker console.");
            return;
        }

        if (response && response.price !== 'N/A') {
            displayResults(ticker, response);
            // After displaying core results, ensure the details section is ready for AI analysis
            document.getElementById('toggleDetails').click(); // Auto-show the details section
        } else {
            alert(`Could not find data for ${ticker}.`);
        }
    });
});

function displayResults(ticker, data) {
    document.getElementById('stockHeader').textContent = `${ticker} - Current Price: $${data.price}`;
    document.getElementById('priceInfo').textContent = `Date: ${data.date} (Source: ${data.source})`;
    
    const targetsList = document.getElementById('dcfTargets');
    targetsList.innerHTML = ''; 

    for (const [key, value] of Object.entries(data.targets)) {
        const li = document.createElement('li');
        li.textContent = `${key} Target: $${value}`;
        targetsList.appendChild(li);
    }
    
    document.getElementById('results').style.display = 'block';
}

function getDetailedAnalysis(rawFinancials) {
    const loadingP = document.createElement('p');
    loadingP.textContent = 'Running AI Analysis...';
    loadingP.style.color = 'red';
    
    const detailsSection = document.getElementById('detailsSection');
    // Clear previous results but keep the structure
    detailsSection.innerHTML = ''; 
    detailsSection.appendChild(loadingP);

    chrome.runtime.sendMessage({ 
        action: "getAIAnalysis", 
        leadershipText: rawFinancials.leadershipText,
        stockType: rawFinancials.stockType,
        macroTrend: rawFinancials.macroTrend
    }, (aiResponse) => {
        if (chrome.runtime.lastError) {
            console.error("Error receiving AI analysis:", chrome.runtime.lastError.message);
            detailsSection.innerHTML = '<p style="color:red;">Failed to get a response from the AI model.</p>';
            return;
        }

        // --- CORRECTED UI UPDATE LOGIC ---
        // Rebuild the inner HTML of the details section with the response
        detailsSection.innerHTML = `
            <h3>AI Analysis</h3>
            <h4>Leadership Analysis</h4>
            <p id="leadershipSummary">${aiResponse.leadershipSummary.join('<br>') || ''}</p>
            <h4>Strategy & Bullish Scenario</h4>
            <pre id="strategyOutput">${aiResponse.strategy || ''}</pre>
            <pre id="bullishScenario">${aiResponse.bullishScenario || ''}</pre>
            <button class="prompt-button" onclick="alert('Re-check Numbers function would trigger a content script (content.js) to scrape live L2 data.')">Re-check Numbers (L2 Data)</button>
        `;
    });
}

document.getElementById('toggleDetails').addEventListener('click', (e) => {
    const section = document.getElementById('detailsSection');
    const isVisible = section.style.display === 'block';
    
    if (isVisible) {
        section.style.display = 'none';
        e.target.textContent = 'Show Background & AI Analysis';
    } else {
        section.style.display = 'block';
        e.target.textContent = 'Hide Background & AI Analysis';
        // If the section is being shown for the first time after valuation, run analysis
        if (!section.hasChildNodes() || section.textContent.trim() === '') {
             chrome.runtime.sendMessage({ action: "runValuation", ticker: document.getElementById('tickerInput').value.toUpperCase().trim() }, (response) => {
                if(response && response.rawFinancials) {
                    getDetailedAnalysis(response.rawFinancials);
                }
            });
        }
    }
});

document.getElementById('noFeedback').addEventListener('click', () => {
    alert('Thank you for using Artha-Mitra! We invite your feedback: https://forms.gle/31fUb9PxCfn1x79TA');
});

