// ============================================================================
// Bulkord Renderer - UI Logic
// ============================================================================

// --- Helpers ---

function maskToken(token) {
    if (!token || token.length < 8) return "(not set)";
    return token.slice(0, 4) + "\u2022".repeat(Math.min(token.length - 8, 20)) + token.slice(-4);
}

function showToast(el, message, type) {
    el.textContent = message;
    el.className = "toast " + type;
    setTimeout(() => { el.textContent = ""; el.className = "toast"; }, 4000);
}

function setProgressBar(fillId, textId, percent, text) {
    document.getElementById(fillId).style.width = percent + "%";
    document.getElementById(textId).textContent = text;
}

function setOperationState(btn, cancelBtn, progressArea, info, isRunning, infoText) {
    btn.disabled = isRunning;
    cancelBtn.style.display = isRunning ? "inline-block" : "none";
    progressArea.style.display = isRunning ? "block" : "none";
    info.textContent = infoText;
}

function showResultColor(el, success) {
    el.style.color = success ? "var(--green)" : "var(--red)";
    setTimeout(() => { el.style.color = ""; }, 5000);
}

// --- Panel Switching ---

const navBtns = document.querySelectorAll(".nav-btn");
const panels = document.querySelectorAll(".panel");

navBtns.forEach(btn => {
    btn.addEventListener("click", () => {
        navBtns.forEach(b => b.classList.remove("active"));
        panels.forEach(p => p.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById(`panel-${btn.dataset.panel}`).classList.add("active");

        if (btn.dataset.panel === "status") refreshStatus();
        if (btn.dataset.panel === "delete") refreshDeleteCount();
    });
});

// --- Configure Panel ---

const configFields = ["authToken", "authorId", "guildId", "channelId", "startMessageId", "endMessageId", "content"];

async function loadConfigIntoForm() {
    const config = await window.bulkord.loadConfig();
    if (config) {
        for (const field of configFields) {
            const el = document.getElementById(field);
            if (el) el.value = config[field] || "";
        }
        document.getElementById("skipPinned").checked = config.skipPinned || false;
    }
}

document.getElementById("saveConfig").addEventListener("click", async () => {
    const config = {};
    for (const field of configFields) {
        config[field] = document.getElementById(field).value.trim();
    }
    config.skipPinned = document.getElementById("skipPinned").checked;
    await window.bulkord.saveConfig(config);
    showToast(document.getElementById("configStatus"), "Configuration saved.", "success");
});

loadConfigIntoForm();

// --- Search Panel ---

let searching = false;

document.getElementById("startSearch").addEventListener("click", async () => {
    if (searching) return;
    searching = true;

    const btn = document.getElementById("startSearch");
    const cancelBtn = document.getElementById("cancelSearch");
    const progressArea = document.getElementById("searchProgress");
    const info = document.getElementById("searchInfo");

    setOperationState(btn, cancelBtn, progressArea, info, true, "Searching...");
    setProgressBar("searchFill", "searchText", 0, "Fetched 0 / 0 messages");

    window.bulkord.onSearchProgress(({ fetched, total }) => {
        const pct = total > 0 ? Math.min((fetched / total) * 100, 100) : 0;
        setProgressBar("searchFill", "searchText", pct, 
            `Fetched ${fetched.toLocaleString()} / ${total.toLocaleString()} messages`);
    });

    const result = await window.bulkord.startSearch();
    searching = false;
    setOperationState(btn, cancelBtn, progressArea, info, false, 
        result.success 
            ? `Search complete. ${result.messageCount.toLocaleString()} messages in database.`
            : `Error: ${result.error}`);
    
    if (result.success) {
        document.getElementById("searchFill").style.width = "100%";
    }
    showResultColor(info, result.success);
});

document.getElementById("cancelSearch").addEventListener("click", async () => {
    await window.bulkord.cancelOperation();
    document.getElementById("searchInfo").textContent = "Cancelling...";
});

// --- Delete Panel ---

let deleting = false;

async function refreshDeleteCount() {
    const { messageCount } = await window.bulkord.getStatus();
    const info = document.getElementById("deleteInfo");
    const btn = document.getElementById("startDelete");

    if (messageCount === 0) {
        info.textContent = "No messages in database. Run a search first.";
        btn.disabled = true;
    } else {
        info.textContent = `${messageCount.toLocaleString()} messages in database ready for deletion.`;
        btn.disabled = false;
    }
}

document.getElementById("startDelete").addEventListener("click", async () => {
    if (deleting) return;
    deleting = true;

    const btn = document.getElementById("startDelete");
    const cancelBtn = document.getElementById("cancelDelete");
    const progressArea = document.getElementById("deleteProgress");
    const info = document.getElementById("deleteInfo");

    setOperationState(btn, cancelBtn, progressArea, info, true, "Deleting...");
    setProgressBar("deleteFill", "deleteText", 0, "Deleted 0 / 0 messages");

    window.bulkord.onDeleteProgress(({ deleted, total, skipped, reason }) => {
        const pct = total > 0 ? Math.min((deleted / total) * 100, 100) : 0;
        const text = skipped 
            ? `Skipped ${reason} message. ${deleted.toLocaleString()} / ${total.toLocaleString()} processed`
            : `Deleted ${deleted.toLocaleString()} / ${total.toLocaleString()} messages`;
        setProgressBar("deleteFill", "deleteText", pct, text);
    });

    const result = await window.bulkord.startDelete();
    deleting = false;
    setOperationState(btn, cancelBtn, progressArea, info, false,
        result.success ? "All messages deleted." : `Error: ${result.error}`);
    
    if (result.success) {
        document.getElementById("deleteFill").style.width = "100%";
    }
    showResultColor(info, result.success);
});

document.getElementById("cancelDelete").addEventListener("click", async () => {
    await window.bulkord.cancelOperation();
    document.getElementById("deleteInfo").textContent = "Cancelling...";
});

// --- Extract Panel ---

let extracting = false;
let extractPath = null;

document.getElementById("selectExtractFolder").addEventListener("click", async () => {
    if (extracting) return;
    const result = await window.bulkord.selectExtractFolder();
    if (result.canceled) return;

    extractPath = result.path;
    document.getElementById("extractPathLabel").textContent = extractPath;
    document.getElementById("startExtract").disabled = false;
});

document.getElementById("startExtract").addEventListener("click", async () => {
    if (extracting || !extractPath) return;
    extracting = true;

    const btn = document.getElementById("startExtract");
    const progressArea = document.getElementById("extractProgress");
    const info = document.getElementById("extractInfo");

    btn.disabled = true;
    progressArea.style.display = "block";
    info.textContent = "Extracting...";
    info.style.color = "";
    setProgressBar("extractFill", "extractText", 0, "Processing 0 / 0 channels");

    window.bulkord.onExtractProgress(({ current, totalFolders, messagesExtracted }) => {
        const pct = totalFolders > 0 ? Math.min((current / totalFolders) * 100, 100) : 0;
        setProgressBar("extractFill", "extractText", pct,
            `Processing ${current} / ${totalFolders} channels (${messagesExtracted.toLocaleString()} messages)`);
    });

    const result = await window.bulkord.startExtract(extractPath);
    extracting = false;
    btn.disabled = false;

    if (result.success) {
        document.getElementById("extractFill").style.width = "100%";
        info.textContent = `Extracted ${result.messages.toLocaleString()} messages from ${result.channels} channels.`;
    } else {
        info.textContent = `Error: ${result.error}`;
    }
    showResultColor(info, result.success);
});

// --- Status Panel ---

async function refreshStatus() {
    const { config, messageCount } = await window.bulkord.getStatus();
    const configEl = document.getElementById("statusConfig");
    const dbEl = document.getElementById("statusDb");

    if (config) {
        configEl.innerHTML = `
            <div class="status-row"><span class="label">Auth Token</span><span class="value">${maskToken(config.authToken)}</span></div>
            <div class="status-row"><span class="label">Author ID</span><span class="value">${config.authorId || "(not set)"}</span></div>
            <div class="status-row"><span class="label">Guild ID</span><span class="value">${config.guildId || "(not set)"}</span></div>
            <div class="status-row"><span class="label">Channel ID</span><span class="value">${config.channelId || "(not set)"}</span></div>
            <div class="status-row"><span class="label">Delete After ID</span><span class="value">${config.startMessageId || "(not set)"}</span></div>
            <div class="status-row"><span class="label">Delete Before ID</span><span class="value">${config.endMessageId || "(not set)"}</span></div>
            <div class="status-row"><span class="label">Content</span><span class="value">${config.content || "(not set)"}</span></div>
            <div class="status-row"><span class="label">Skip Pinned</span><span class="value">${config.skipPinned ? "Yes" : "No"}</span></div>
        `;
    } else {
        configEl.innerHTML = `<p class="text-muted">No configuration found.</p>`;
    }

    dbEl.innerHTML = `
        <div class="big-number">${messageCount.toLocaleString()}</div>
        <div class="big-number-label">messages in database</div>
    `;
}

// --- Data Management ---

function makeConfirmBtn(btnId, label, action, toastId) {
    let confirmPending = false;
    let confirmTimer = null;

    document.getElementById(btnId).addEventListener("click", async () => {
        const btn = document.getElementById(btnId);
        if (!confirmPending) {
            confirmPending = true;
            btn.textContent = "Click again to confirm";
            confirmTimer = setTimeout(() => {
                confirmPending = false;
                btn.textContent = label;
            }, 3000);
            return;
        }
        clearTimeout(confirmTimer);
        confirmPending = false;
        btn.textContent = label;

        const result = await action();
        showToast(document.getElementById(toastId),
            result.success ? `${label} successful.` : `Error: ${result.error}`,
            result.success ? "success" : "error");
    });
}

makeConfirmBtn("clearConfig", "Clear Config", window.bulkord.clearConfig, "dataMgmtStatus");
makeConfirmBtn("clearDb", "Clear Database", window.bulkord.clearDb, "dataMgmtStatus");

document.getElementById("openFileLocation").addEventListener("click", async () => {
    const result = await window.bulkord.openFileLocation();
    if (result.success) {
        showToast(document.getElementById("dataMgmtStatus"), "Opening file location...", "success");
    } else {
        showToast(document.getElementById("dataMgmtStatus"), `Error: ${result.error}`, "error");
    }
});
