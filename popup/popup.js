// popup.js

const API_KEY_STORAGE_KEY = 'geminiCloudApiKey';

// --- Notification Bar Logic ---
function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    if (!notification) {
        console.error("Notification element not found!");
        return;
    }
    notification.textContent = message;
    notification.className = 'notification-bar'; // Reset classes
    
    if (type === 'error') notification.classList.add('notification-error');
    else if (type === 'success') notification.classList.add('notification-success');
    else notification.classList.add('notification-info');

    notification.style.display = 'block';

    setTimeout(() => {
        notification.style.display = 'none';
    }, 4000);
}


// --- Function to Load Gemini Key Status ---
async function loadApiKeyStatus() {
    const statusElement = document.getElementById('keyStatus');
    const inputElement = document.getElementById('geminiApiKeyInput');
    const cloudIcon = document.getElementById('cloudKeyIcon');

    try {
        const result = await chrome.storage.local.get(API_KEY_STORAGE_KEY);
        const storedKey = result[API_KEY_STORAGE_KEY];

        if (storedKey) {
            statusElement.textContent = 'Status: Cloud API Key is saved.';
            statusElement.style.color = 'green';
            inputElement.placeholder = 'Key is saved (Click to update)';
            cloudIcon.style.stroke = 'green';
        } else {
            statusElement.textContent = 'Status: Cloud API Key is missing.';
            statusElement.style.color = 'orange';
            inputElement.placeholder = 'Enter Gemini Cloud API Key';
            cloudIcon.style.stroke = 'orange';
        }
    } catch (e) {
        console.error("Error loading API key status:", e);
        statusElement.textContent = 'Error loading key status.';
    }
}


// --- Core Ticker Analysis Function ---
function runTickerAnalysis(ticker) {
    if (!ticker) {
        showNotification('Please enter or select a stock ticker.', 'error');
        return;
    }

    document.getElementById('tickerInput').value = ticker;
    document.getElementById('dcf-container').style.display = 'none';
    document.getElementById('rationaleSection').style.display = 'none';
    document.getElementById('final-results').style.display = 'none';
    document.getElementById('loading').style.display = 'block';
    
    chrome.runtime.sendMessage({ action: "runValuation", ticker: ticker }, (response) => {
        document.getElementById('loading').style.display = 'none';
        
        if (chrome.runtime.lastError) {
            console.error("Error from background:", chrome.runtime.lastError.message);
            showNotification("An error occurred. Check the service worker console.", "error");
            return;
        }
        
        if (response && response.error) {
             showNotification(`Analysis Error: ${response.error}`, 'error');
        } else if (response && response.dcfParameters) {
            populateDcfInputs(response);
            
            // --- NEW LOGIC (Request 2) ---
            // Automatically calculate intrinsic value
            calculateLocalDcf(); 
            
            // Automatically display rationale
            const rationaleData = response.rationale;
            if (rationaleData && Object.keys(rationaleData).length > 0) {
                displayRationaleDetails(rationaleData);
                document.getElementById('rationaleSection').style.display = 'block';
            }
            // --- END NEW LOGIC ---

            document.getElementById('dcf-container').style.display = 'block';
            showNotification('DCF Parameters & Rationale loaded.', 'success'); // Updated message
        
        } else {
            showNotification(`Could not find data for ${ticker}.`, 'error');
        }
    });
}


// --- Populate UI with Gemini Data ---
function populateDcfInputs(data) {
    const params = data.dcfParameters;
    
    // Store latest price and consensus data for later calculation/display
    document.getElementById('final-results').dataset.latestPrice = data.latestPrice;
    document.getElementById('final-results').dataset.analystConsensus = JSON.stringify(data.analystConsensus);

    // Set headers
    document.getElementById('stockHeader').textContent = `${data.ticker} - Current: $${data.latestPrice.toFixed(2)}`;
    document.getElementById('priceInfo').textContent = `As of: ${data.priceDate}`;
    
    // Populate input fields
    // UFCF Components
    document.getElementById('input-ttmNopat').value = params.ttmNopat.toFixed(2);
    document.getElementById('input-ttmDna').value = params.ttmDepreciationAndAmortization.toFixed(2);
    document.getElementById('input-ttmCapex').value = params.ttmCapitalExpenditures.toFixed(2);
    document.getElementById('input-ttmNwc').value = params.ttmChangeInNetWorkingCapital.toFixed(2);
    document.getElementById('input-ufcfGrowth').value = params.ufcfGrowthRate.toFixed(4);

    // WACC Components
    document.getElementById('input-marketEquity').value = params.marketValueEquity.toFixed(2);
    document.getElementById('input-marketDebt').value = params.marketValueDebt.toFixed(2);
    document.getElementById('input-costEquity').value = params.costOfEquity.toFixed(4);
    document.getElementById('input-costDebt').value = params.costOfDebt.toFixed(4);
    document.getElementById('input-taxRate').value = params.corporateTaxRate.toFixed(4);

    // Equity Value Components
    document.getElementById('input-netDebt').value = params.netDebt.toFixed(2);
    document.getElementById('input-shares').value = params.sharesOutstanding.toFixed(2);
    document.getElementById('input-perpGrowth').value = params.perpetualGrowthRate.toFixed(4);
    
    // Rationale data is no longer stored in a button, it's displayed immediately
}

// --- Local DCF Calculation ---
function calculateLocalDcf() {
    try {
        // === 1. Read all values from input fields ===
        
        // UFCF Components
        const ttmNopat = parseFloat(document.getElementById('input-ttmNopat').value);
        const ttmDna = parseFloat(document.getElementById('input-ttmDna').value);
        const ttmCapex = parseFloat(document.getElementById('input-ttmCapex').value);
        const ttmNwc = parseFloat(document.getElementById('input-ttmNwc').value);
        const ufcfGrowth = parseFloat(document.getElementById('input-ufcfGrowth').value);

        // WACC Components
        const E = parseFloat(document.getElementById('input-marketEquity').value);
        const D = parseFloat(document.getElementById('input-marketDebt').value);
        const Re = parseFloat(document.getElementById('input-costEquity').value);
        const Rd = parseFloat(document.getElementById('input-costDebt').value);
        const t = parseFloat(document.getElementById('input-taxRate').value);

        // Equity Value Components
        const netDebt = parseFloat(document.getElementById('input-netDebt').value);
        const shares = parseFloat(document.getElementById('input-shares').value);
        const perpGrowth = parseFloat(document.getElementById('input-perpGrowth').value);
        
        // UPDATED: Get latestPrice from its new storage location
        const latestPrice = parseFloat(document.getElementById('final-results').dataset.latestPrice);

        // Validate all inputs
        const allInputs = [
            ttmNopat, ttmDna, ttmCapex, ttmNwc, ufcfGrowth,
            E, D, Re, Rd, t,
            netDebt, shares, perpGrowth, latestPrice
        ];

        if (allInputs.some(isNaN)) {
            showNotification("All input fields must be valid numbers.", "error");
            return;
        }

        // === 2. Calculate Base UFCF and WACC ===
        
        // UFCF = NOPAT + (D&A) - (CapEx) - (Change in NWC)
        // Note: We assume user enters CapEx as a positive number, so we subtract it.
        const baseUfcf = ttmNopat + ttmDna - ttmCapex - ttmNwc;
        
        // WACC = (E/(D+E) * Re) + (D/(D+E) * Rd * (1 - t))
        const V = E + D;
        const wacc = (E/V * Re) + (D/V * Rd * (1 - t));

        if (wacc <= perpGrowth) {
            showNotification("Calculated WACC must be greater than Perpetual Growth Rate.", "error");
            return;
        }

        // Display calculated WACC and Base UFCF
        document.getElementById('baseUfcfValue').textContent = `$${baseUfcf.toFixed(2)}M`;
        document.getElementById('waccValue').textContent = `${(wacc * 100).toFixed(2)}%`;


        // === 3. Run DCF Calculation Logic ===
        const forecastPeriod = 5;
        let presentValuesSum = 0;

        // 3a. Calculate PV of forecasted cash flows
        for (let i = 1; i <= forecastPeriod; i++) {
            const futureUfcf = baseUfcf * Math.pow(1 + ufcfGrowth, i);
            const pv = futureUfcf / Math.pow(1 + wacc, i);
            presentValuesSum += pv;
        }

        // 3b. Calculate Terminal Value
        
        // UFCF for the *last* year of the forecast period (Year 5)
        const lastYearUfcf = baseUfcf * Math.pow(1 + ufcfGrowth, forecastPeriod);
        
        // Terminal Value at Year 5, using the UFCF for Year 6
        const terminalValue = (lastYearUfcf * (1 + perpGrowth)) / (wacc - perpGrowth);


        // 3c. Calculate PV of Terminal Value
        const pvTerminalValue = terminalValue / Math.pow(1 + wacc, forecastPeriod);

        // 3d. Calculate Enterprise and Equity Value
        const enterpriseValue = presentValuesSum + pvTerminalValue;
        const equityValue = enterpriseValue - netDebt;
        
        // 3e. Calculate Intrinsic Value Per Share
        const intrinsicValuePerShare = equityValue / shares;

        // This function now handles both Intrinsic Value and Analyst Targets
        displayFinalResults(intrinsicValuePerShare, latestPrice);
    
    } catch (e) {
        console.error("DCF Calculation Error:", e);
        showNotification(`Calculation Error: ${e.message}`, "error");
    }
}

// --- Display Final Calculated Results ---
function displayFinalResults(intrinsicValue, latestPrice) {
    // Request 0: Display calculated intrinsic value
    document.getElementById('intrinsicValue').textContent = `$${intrinsicValue.toFixed(2)}`;
    
    // Request 1: Display analyst consensus targets
    const estimatesList = document.getElementById('analystEstimateTargets'); // UPDATED ID
    estimatesList.innerHTML = ''; // Clear previous

    const consensusData = JSON.parse(document.getElementById('final-results').dataset.analystConsensus || '{}');

    const target3m = consensusData.target_3m || 0.0;
    const target6m = consensusData.target_6m || 0.0;
    const target12m = consensusData.target_12m || 0.0;

    estimatesList.innerHTML = `
        <li>3-Month Target: <b>$${target3m.toFixed(2)}</b></li>
        <li>6-Month Target: <b>$${target6m.toFixed(2)}</b></li>
        <li>12-Month Target: <b>$${target12m.toFixed(2)}</b></li>
    `;

    document.getElementById('final-results').style.display = 'block';
}

// --- Handle Input Adjustments ---
function adjustInputValue(field, op) {
    // New field map for UFCF and WACC components
    const fieldMap = {
        'ufcfGrowth': { id: 'input-ufcfGrowth', step: 0.005 },
        'costEquity': { id: 'input-costEquity', step: 0.001 },
        'costDebt': { id: 'input-costDebt', step: 0.001 },
        'taxRate': { id: 'input-taxRate', step: 0.001 },
        'netDebt': { id: 'input-netDebt', step: 100 },
        'shares': { id: 'input-shares', step: 10 },
        'perpGrowth': { id: 'input-perpGrowth', step: 0.001 }
        // Note: TTM/Market values are large and less likely to be "adjusted" with buttons
    };

    const config = fieldMap[field];
    if (!config) return;

    const input = document.getElementById(config.id);
    let value = parseFloat(input.value);
    const step = config.step;

    if (op === '+') {
        value += step;
    } else if (op === '-') {
        value -= step;
    }

    // Fix precision issues
    let decimals = (step.toString().split('.')[1] || []).length;
    input.value = value.toFixed(decimals);
}

// --- Display AI Rationale ---
function displayRationaleDetails(rationale) {
    if (!rationale) return;
    document.getElementById('rationale-ufcf').textContent = rationale.ufcfComponents + "\n\n" + rationale.ufcfGrowthRate || 'N/A';
    document.getElementById('rationale-wacc').textContent = rationale.waccComponents || 'N/A';
    document.getElementById('rationale-netDebt').textContent = rationale.netDebt || 'N/A';
    document.getElementById('rationale-shares').textContent = rationale.sharesOutstanding || 'N/A';
    document.getElementById('rationale-perpGrowth').textContent = rationale.perpetualGrowthRate || 'N/A';
    // ADDED: Display rationale for analyst consensus
    document.getElementById('rationale-analystConsensus').textContent = rationale.analystConsensus || 'N/A';
}


// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    loadApiKeyStatus();

    // --- Modal Logic ---
    const modal = document.getElementById('apiKeyModal');
    const cloudIcon = document.getElementById('cloudKeyIcon');
    const closeButton = document.querySelector('.close-button');

    if (cloudIcon) cloudIcon.addEventListener('click', () => { modal.style.display = "block"; });
    if (closeButton) closeButton.addEventListener('click', () => { modal.style.display = "none"; });
    window.addEventListener('click', (event) => {
        if (event.target == modal) modal.style.display = "none";
    });

    // --- Single Stock Analysis Button Logic (UPDATED) ---
    document.getElementById('runDcfValuationButton').addEventListener('click', () => {
        const ticker = document.getElementById('tickerInput').value.toUpperCase().trim();
        runTickerAnalysis(ticker);
    });

    // --- API Key Save Button ---
    document.getElementById('saveApiKeyButton').addEventListener('click', async () => {
        const inputElement = document.getElementById('geminiApiKeyInput');
        const key = inputElement.value.trim();
        if (key) {
            await chrome.storage.local.set({ [API_KEY_STORAGE_KEY]: key });
             showNotification('Gemini API Key saved successfully!', 'success');
        } else {
            await chrome.storage.local.remove(API_KEY_STORAGE_KEY);
            showNotification('Gemini API Key removed.', 'info');
        }
        inputElement.value = '';
        loadApiKeyStatus();
    });

    // --- REMOVED Toggle Rationale Logic ---
    // --- REMOVED Local DCF Calculation Button Logic ---

    // --- Parameter Adjustment Buttons ---
    document.getElementById('dcf-inputs').addEventListener('click', (e) => {
        if (e.target.classList.contains('adjust-btn')) {
            const field = e.target.dataset.field;
            const op = e.target.dataset.op;
            adjustInputValue(field, op);
        }
    });
});
