// popup.js

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
            inputElement.placeholder = 'Key is saved (Click to update)';
        } else {
            statusElement.textContent = 'Status: Cloud API Key is missing. Hybrid mode disabled.';
            statusElement.style.color = 'red';
            inputElement.placeholder = 'Enter Gemini Cloud API Key';
        }
    } catch (e) {
        console.error("Error loading API key status:", e);
        statusElement.textContent = 'Error loading key status.';
    }
}

// --- Event Listener for Saving Key ---
document.getElementById('saveApiKeyButton').addEventListener('click', async () => {
    const inputElement = document.getElementById('geminiApiKeyInput');
    const key = inputElement.value.trim();
    
    if (key) {
        await chrome.storage.local.set({ [API_KEY_STORAGE_KEY]: key });
        inputElement.value = ''; // Clear input after saving
    }
    loadApiKeyStatus(); // Refresh status
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
    
    // --- Single, Authoritative Call to the Background Script ---
    chrome.runtime.sendMessage({ action: "runValuation", ticker: ticker }, (response) => {
        document.getElementById('loading').style.display = 'none';
        
        if (chrome.runtime.lastError) {
            console.error("Error from background:", chrome.runtime.lastError.message);
            alert("An error occurred. Check the service worker console for details.");
            return;
        }

        if (response && response.price !== 'N/A') {
            displayResults(ticker, response);
            // Directly trigger the AI analysis after displaying results
            getDetailedAnalysis(response.rawFinancials);
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
    // --- CORRECTED UI UPDATE LOGIC ---
    const detailsSection = document.getElementById('detailsSection');
    const leadershipSummaryEl = document.getElementById('leadershipSummary');
    const strategyOutputEl = document.getElementById('strategyOutput');
    const bullishScenarioEl = document.getElementById('bullishScenario');

    // Show the section and display the loading message inside the first element
    detailsSection.style.display = 'block';
    leadershipSummaryEl.innerHTML = '<p style="color:red;">Running AI Analysis (Hybrid Mode)...</p>';
    strategyOutputEl.textContent = '';
    bullishScenarioEl.textContent = '';

    chrome.runtime.sendMessage({ 
        action: "getAIAnalysis", 
        leadershipText: rawFinancials.leadershipText,
        stockType: rawFinancials.stockType,
        macroTrend: rawFinancials.macroTrend
    }, (aiResponse) => {
        if (chrome.runtime.lastError) {
            console.error("Error receiving AI analysis:", chrome.runtime.lastError.message);
            leadershipSummaryEl.innerHTML = '<p style="color:red;">Failed to get a response from the AI model.</p>';
            return;
        }

        // Correctly populate the specific elements with the final results
        leadershipSummaryEl.innerHTML = aiResponse.leadershipSummary.join('<br>') || '';
        strategyOutputEl.textContent = aiResponse.strategy || '';
        bullishScenarioEl.textContent = aiResponse.bullishScenario || '';
    });
}

// --- Simplified Toggle Logic ---
document.getElementById('toggleDetails').addEventListener('click', (e) => {
    const section = document.getElementById('detailsSection');
    const isVisible = section.style.display === 'block';
    
    section.style.display = isVisible ? 'none' : 'block';
    e.target.textContent = isVisible ? 'Show Background & AI Analysis' : 'Hide Background & AI Analysis';
});

document.getElementById('noFeedback').addEventListener('click', () => {
    alert('Thank you for using Artha-Mitra! We invite your feedback: https://forms.gle/31fUb9PxCfn1x79TA');
});

