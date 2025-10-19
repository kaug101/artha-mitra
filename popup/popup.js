// popup.js

const API_KEY_STORAGE_KEY = 'geminiCloudApiKey';

// --- Function to Load Key Status on Popup Open ---
async function loadApiKeyStatus() {
    const statusElement = document.getElementById('keyStatus');
    const inputElement = document.getElementById('geminiApiKeyInput');
    const cloudIcon = document.getElementById('cloudKeyIcon');

    try {
        const result = await chrome.storage.local.get(API_KEY_STORAGE_KEY);
        const storedKey = result[API_KEY_STORAGE_KEY];

        if (storedKey) {
            statusElement.textContent = 'Status: Cloud API Key is saved. Cloud-first mode is ACTIVE.';
            statusElement.style.color = 'green';
            inputElement.placeholder = 'Key is saved (Click to update)';
            cloudIcon.style.stroke = 'green';
            cloudIcon.style.fill = 'green';
        } else {
            statusElement.textContent = 'Status: Cloud API Key is missing. Using on-device Nano model.';
            statusElement.style.color = 'red';
            inputElement.placeholder = 'Enter Gemini Cloud API Key';
            cloudIcon.style.stroke = 'red';
            cloudIcon.style.fill = 'red';
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
    } else {
        // Allow users to clear the key
        await chrome.storage.local.remove(API_KEY_STORAGE_KEY);
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
    // --- UI Elements ---
    const detailsSection = document.getElementById('detailsSection');
    const aiHeaderEl = document.getElementById('aiAnalysisHeader');
    const leadershipSummaryEl = document.getElementById('leadershipSummary');
    const strategyOutputEl = document.getElementById('strategyOutput');
    const bullishScenarioEl = document.getElementById('bullishScenario');

    // Show the section and display the loading message
    detailsSection.style.display = 'block';
    aiHeaderEl.textContent = 'AI Analysis';
    leadershipSummaryEl.innerHTML = '<p style="color:orange;">Running AI Analysis (Cloud-First)...</p>';
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
            leadershipSummaryEl.innerHTML = `<p style="color:red;">Failed to connect to the background script. Check the extension's error logs.</p>`;
            return;
        }

        // Update UI with results and indicate the source
        aiHeaderEl.textContent = `AI Analysis (Powered by Gemini ${aiResponse.source})`;
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

// --- Modal Logic ---
const modal = document.getElementById('apiKeyModal');
const cloudIcon = document.getElementById('cloudKeyIcon');
const closeButton = document.querySelector('.close-button');

// When the user clicks the cloud icon, open the modal 
cloudIcon.onclick = function() {
  modal.style.display = "block";
}

// When the user clicks on <span> (x), close the modal
closeButton.onclick = function() {
  modal.style.display = "none";
}

// When the user clicks anywhere outside of the modal, close it
window.onclick = function(event) {
  if (event.target == modal) {
    modal.style.display = "none";
  }
}

