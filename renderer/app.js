// --- Panel switching ---
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

// --- Configure ---
const configFields = ["authToken", "authorId", "guildId", "channelId", "minId", "maxId", "content"];

async function loadConfigIntoForm() {
    const config = await window.bulkord.loadConfig();
    if (config) {
        for (const field of configFields) {
            const el = document.getElementById(field);
            if (el) el.value = config[field] || "";
        }
    }
}

document.getElementById("saveConfig").addEventListener("click", async () => {
    const config = {};
    for (const field of configFields) {
        config[field] = document.getElementById(field).value.trim();
    }
    await window.bulkord.saveConfig(config);
    showToast(document.getElementById("configStatus"), "Configuration saved.", "success");
});

loadConfigIntoForm();

// --- Search ---
let searching = false;

document.getElementById("startSearch").addEventListener("click", async () => {
    if (searching) return;
    searching = true;

    const btn = document.getElementById("startSearch");
    const cancelBtn = document.getElementById("cancelSearch");
    const progressArea = document.getElementById("searchProgress");
    const info = document.getElementById("searchInfo");

    btn.disabled = true;
    cancelBtn.style.display = "inline-block";
    progressArea.style.display = "block";
    info.textContent = "Searching...";
    document.getElementById("searchFill").style.width = "0%";
    document.getElementById("searchText").textContent = "Fetched 0 / 0 messages";

    window.bulkord.onSearchProgress(({ fetched, total }) => {
        const pct = total > 0 ? Math.min((fetched / total) * 100, 100) : 0;
        document.getElementById("searchFill").style.width = pct + "%";
        document.getElementById("searchText").textContent = `Fetched ${fetched.toLocaleString()} / ${total.toLocaleString()} messages`;
    });

    const result = await window.bulkord.startSearch();
    searching = false;
    btn.disabled = false;
    cancelBtn.style.display = "none";

    if (result.success) {
        document.getElementById("searchFill").style.width = "100%";
        info.textContent = `Search complete. ${result.messageCount.toLocaleString()} messages in database.`;
        info.style.color = "var(--green)";
    } else {
        info.textContent = `Error: ${result.error}`;
        info.style.color = "var(--red)";
    }

    setTimeout(() => { info.style.color = ""; }, 5000);
});

document.getElementById("cancelSearch").addEventListener("click", async () => {
    await window.bulkord.cancelOperation();
    document.getElementById("searchInfo").textContent = "Cancelling...";
});

// --- Delete ---
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

    btn.disabled = true;
    cancelBtn.style.display = "inline-block";
    progressArea.style.display = "block";
    info.textContent = "Deleting...";
    document.getElementById("deleteFill").style.width = "0%";
    document.getElementById("deleteText").textContent = "Deleted 0 / 0 messages";

    window.bulkord.onDeleteProgress(({ deleted, total, skipped, reason }) => {
        const pct = total > 0 ? Math.min((deleted / total) * 100, 100) : 0;
        document.getElementById("deleteFill").style.width = pct + "%";
        if (skipped) {
            document.getElementById("deleteText").textContent = `Skipped ${reason} message. ${deleted.toLocaleString()} / ${total.toLocaleString()} processed`;
        } else {
            document.getElementById("deleteText").textContent = `Deleted ${deleted.toLocaleString()} / ${total.toLocaleString()} messages`;
        }
    });

    const result = await window.bulkord.startDelete();
    deleting = false;
    btn.disabled = false;
    cancelBtn.style.display = "none";

    if (result.success) {
        document.getElementById("deleteFill").style.width = "100%";
        info.textContent = "All messages deleted.";
        info.style.color = "var(--green)";
    } else {
        info.textContent = `Error: ${result.error}`;
        info.style.color = "var(--red)";
    }

    setTimeout(() => { info.style.color = ""; }, 5000);
});

document.getElementById("cancelDelete").addEventListener("click", async () => {
    await window.bulkord.cancelOperation();
    document.getElementById("deleteInfo").textContent = "Cancelling...";
});

// --- Extract ---
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
    document.getElementById("extractFill").style.width = "0%";
    document.getElementById("extractText").textContent = "Processing 0 / 0 channels";

    window.bulkord.onExtractProgress(({ current, totalFolders, messagesExtracted }) => {
        const pct = totalFolders > 0 ? Math.min((current / totalFolders) * 100, 100) : 0;
        document.getElementById("extractFill").style.width = pct + "%";
        document.getElementById("extractText").textContent =
            `Processing ${current} / ${totalFolders} channels (${messagesExtracted.toLocaleString()} messages)`;
    });

    const result = await window.bulkord.startExtract(extractPath);
    extracting = false;
    btn.disabled = false;

    if (result.success) {
        document.getElementById("extractFill").style.width = "100%";
        info.textContent = `Extracted ${result.messages.toLocaleString()} messages from ${result.channels} channels.`;
        info.style.color = "var(--green)";
    } else {
        info.textContent = `Error: ${result.error}`;
        info.style.color = "var(--red)";
    }

    setTimeout(() => { info.style.color = ""; }, 5000);
});

// --- Status ---
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
            <div class="status-row"><span class="label">Min ID</span><span class="value">${config.minId || "(not set)"}</span></div>
            <div class="status-row"><span class="label">Max ID</span><span class="value">${config.maxId || "(not set)"}</span></div>
            <div class="status-row"><span class="label">Content</span><span class="value">${config.content || "(not set)"}</span></div>
        `;
    } else {
        configEl.innerHTML = `<p class="text-muted">No configuration found.</p>`;
    }

    dbEl.innerHTML = `
        <div class="big-number">${messageCount.toLocaleString()}</div>
        <div class="big-number-label">messages in database</div>
    `;
}
