const state = {
  callId: null,
  from: "",
  to: "",
  exotelLiveOnlyMode: false,
  livekitConfig: null,
  providerEvents: [],
  recognition: null,
  runtimeLogs: [],
  sarvamOnlyMode: false,
  livekitPlugins: null,
  isListening: false
};

const VIRTUAL_CALLER_ID = "+919876543210";

const ui = {
  toInput: document.getElementById("toInput"),
  startBtn: document.getElementById("startBtn"),
  endBtn: document.getElementById("endBtn"),
  statusBadge: document.getElementById("statusBadge"),
  callIdLabel: document.getElementById("callIdLabel"),
  userLane: document.getElementById("userLane"),
  agentLane: document.getElementById("agentLane"),
  agentAudio: document.getElementById("agentAudio"),
  audioStatus: document.getElementById("audioStatus"),
  startListeningBtn: document.getElementById("startListeningBtn"),
  stopListeningBtn: document.getElementById("stopListeningBtn"),
  micStatus: document.getElementById("micStatus"),
  liveTranscript: document.getElementById("liveTranscript"),
  knowledgeContext: document.getElementById("knowledgeContext"),
  ttsPayload: document.getElementById("ttsPayload"),
  virtualPhoneNumber: document.getElementById("virtualPhoneNumber"),
  exotelNotice: document.getElementById("exotelNotice"),
  providerStatus: document.getElementById("providerStatus"),
  providerEvents: document.getElementById("providerEvents"),
  callHistory: document.getElementById("callHistory"),
  integrationHealth: document.getElementById("integrationHealth"),
  runtimeLogs: document.getElementById("runtimeLogs"),
  toolLogChat: document.getElementById("toolLogChat"),
  livekitStatusPill: document.getElementById("livekitStatusPill"),
  sarvamStatusPill: document.getElementById("sarvamStatusPill"),
  webControlsPanel: document.getElementById("webControlsPanel"),
  webTalkPanel: document.getElementById("webTalkPanel"),
  exotelPanel: document.getElementById("exotelPanel"),
  exotelCallSid: document.getElementById("exotelCallSid"),
  exotelFrom: document.getElementById("exotelFrom"),
  exotelTranscription: document.getElementById("exotelTranscription"),
  sendExotelTurnBtn: document.getElementById("sendExotelTurnBtn")
};

async function applyFeatureFlags() {
  try {
    const health = await api("/api/health");
    const exotelEnabled = Boolean(health?.exotel?.enabled);
    state.exotelLiveOnlyMode = Boolean(health?.exotelLiveOnlyMode);
    state.sarvamOnlyMode = Boolean(health?.sarvamOnlyMode);
    state.livekitConfig = health?.livekit ?? null;
    state.livekitPlugins = health?.plugins ?? null;

    renderIntegrationHealth();

    if (ui.virtualPhoneNumber) {
      ui.virtualPhoneNumber.textContent = exotelEnabled ? "+91 Live Exophone (Connected)" : "+91 98765 43210 (Simulated)";
    }

    if (state.exotelLiveOnlyMode) {
      if (ui.webControlsPanel) {
        ui.webControlsPanel.style.display = "none";
      }
      if (ui.webTalkPanel) {
        ui.webTalkPanel.style.display = "none";
      }
      if (ui.exotelNotice) {
        ui.exotelNotice.textContent =
          "Live Exotel mode is active. Browser simulation controls are disabled; use Exotel webhook/media flow with LiveKit.";
      }
      setProviderStatus("Live Exotel mode active");
    }

    if (!exotelEnabled && ui.exotelPanel) {
      ui.exotelPanel.style.display = "none";
      if (ui.exotelNotice) {
        ui.exotelNotice.textContent =
          "Real PSTN calling is intentionally disabled right now. Exotel vSIP is deferred until provider checks and KYC are completed.";
      }
      setProviderStatus("Simulation mode active: browser call flow only");
      return;
    }

    if (ui.exotelNotice) {
      ui.exotelNotice.textContent =
        "Exotel integration is enabled. Calls can be bridged with provider events based on your trunk configuration.";
    }
  } catch {
    setProviderStatus("Could not read feature flags from server");
  }
}

function setCallActive(active) {
  ui.endBtn.disabled = !active;
  if (ui.startListeningBtn) {
    ui.startListeningBtn.disabled = !active;
  }
  if (ui.stopListeningBtn) {
    ui.stopListeningBtn.disabled = true;
  }
  ui.startBtn.disabled = active;

  if (!active) {
    ui.callIdLabel.textContent = "Call ID: -";
    ui.statusBadge.textContent = "No active call";
    if (ui.liveTranscript) {
      ui.liveTranscript.textContent = "Waiting for voice input...";
    }
    if (ui.micStatus) {
      ui.micStatus.textContent = "Mic: idle";
    }
    stopListening();
  }
}

function getRecognitionEngine() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    return null;
  }

  if (!state.recognition) {
    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      state.isListening = true;
      if (ui.micStatus) {
        ui.micStatus.textContent = "Mic: listening...";
      }
      if (ui.startListeningBtn) {
        ui.startListeningBtn.disabled = true;
      }
      if (ui.stopListeningBtn) {
        ui.stopListeningBtn.disabled = false;
      }
    };

    recognition.onend = () => {
      state.isListening = false;
      if (ui.micStatus) {
        ui.micStatus.textContent = "Mic: idle";
      }
      if (ui.startListeningBtn) {
        ui.startListeningBtn.disabled = !state.callId;
      }
      if (ui.stopListeningBtn) {
        ui.stopListeningBtn.disabled = true;
      }
    };

    recognition.onerror = (event) => {
      if (ui.micStatus) {
        ui.micStatus.textContent = `Mic error: ${event.error}`;
      }
    };

    recognition.onresult = async (event) => {
      let interim = "";
      let finalText = "";

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interim += transcript;
        }
      }

      if (ui.liveTranscript) {
        ui.liveTranscript.textContent = (finalText || interim || "Listening...").trim();
      }

      if (finalText.trim()) {
        await submitCallerUtterance(finalText.trim());
      }
    };

    state.recognition = recognition;
  }

  return state.recognition;
}

function startListening() {
  if (!state.callId) {
    return;
  }

  const recognition = getRecognitionEngine();
  if (!recognition) {
    if (ui.micStatus) {
      ui.micStatus.textContent = "Mic unsupported in this browser. Use Chrome or Edge.";
    }
    return;
  }

  try {
    recognition.start();
  } catch {
    if (ui.micStatus) {
      ui.micStatus.textContent = "Mic could not start. Check browser mic permission.";
    }
  }
}

function stopListening() {
  if (state.recognition && state.isListening) {
    state.recognition.stop();
  }
}

async function submitCallerUtterance(utterance) {
  if (!state.callId || !utterance) {
    return;
  }

  const now = new Date().toISOString();
  appendTranscriptLine("caller", utterance, now);

  try {
    const data = await api(`/api/call/${state.callId}/turn`, {
      method: "POST",
      body: JSON.stringify({ utterance })
    });

    const agentLine = data.session.transcript[data.session.transcript.length - 1];
    appendTranscriptLine("agent", agentLine.text, agentLine.timestamp);
    ui.knowledgeContext.textContent = data.knowledgeContext;
    ui.ttsPayload.textContent = JSON.stringify(data.tts, null, 2);
    await playAgentVoice(data.tts, agentLine.text);
    await loadCallHistory();
  } catch (error) {
    alert(error.message || "Turn failed");
  }
}

function appendTranscriptLine(speaker, text, timestamp) {
  const line = document.createElement("article");
  line.className = `line ${speaker}`;
  line.innerHTML = `
    <span class="meta">${speaker.toUpperCase()} • ${new Date(timestamp).toLocaleTimeString()}</span>
    <div>${text}</div>
  `;

  const targetLane = speaker === "caller" ? ui.userLane : ui.agentLane;
  if (!targetLane) {
    return;
  }
  targetLane.appendChild(line);
  targetLane.scrollTop = targetLane.scrollHeight;
}

async function playAgentVoice(ttsPayload, fallbackText) {
  if (!ui.agentAudio || !ui.audioStatus) {
    return;
  }

  const audioBase64 = typeof ttsPayload?.audioBase64 === "string" ? ttsPayload.audioBase64 : "";
  if (audioBase64) {
    ui.agentAudio.src = `data:audio/mp3;base64,${audioBase64}`;
    ui.audioStatus.textContent = "Agent voice: Sarvam audio playback";
    try {
      await ui.agentAudio.play();
    } catch {
      ui.audioStatus.textContent = "Agent voice ready in player (tap play)";
    }
    return;
  }

  if ("speechSynthesis" in window && fallbackText) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(fallbackText);
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
    ui.audioStatus.textContent = "Agent voice: browser speech fallback";
    return;
  }

  ui.audioStatus.textContent = "Agent voice unavailable (no audio payload)";
}

function setProviderStatus(text) {
  if (ui.providerStatus) {
    ui.providerStatus.textContent = text;
  }
}

function renderIntegrationHealth() {
  if (!ui.integrationHealth) {
    return;
  }

  const pluginLines = [];
  if (Array.isArray(state.livekitPlugins)) {
    for (const plugin of state.livekitPlugins) {
      const pluginName = plugin?.packageName || "unknown";
      const status = plugin?.loaded ? "ok" : "missing";
      pluginLines.push(`livekit:${pluginName}=${status}`);
    }
  }

  const lines = [
    `exotelLiveOnlyMode=${state.exotelLiveOnlyMode ? "true" : "false"}`,
    `sarvamOnlyMode=${state.sarvamOnlyMode ? "true" : "false"}`,
    ...pluginLines
  ];

  ui.integrationHealth.textContent = lines.join("\n") || "No integration health available";
  updateToolStatusPills();
}

function getLatestComponentStatus(componentName) {
  for (let i = state.runtimeLogs.length - 1; i >= 0; i -= 1) {
    const entry = state.runtimeLogs[i];
    if (entry?.component === componentName) {
      return entry.status === "ok" ? "ok" : "error";
    }
  }
  return "unknown";
}

function setPillState(element, label, status) {
  if (!element) {
    return;
  }

  element.classList.remove("ok", "error");
  if (status === "ok") {
    element.classList.add("ok");
    element.textContent = `${label}: working`;
    return;
  }
  if (status === "error") {
    element.classList.add("error");
    element.textContent = `${label}: error`;
    return;
  }
  element.textContent = `${label}: waiting`;
}

function updateToolStatusPills() {
  let livekitStatus = "unknown";
  if (state.livekitConfig) {
    const isConfigured =
      Boolean(state.livekitConfig.urlConfigured) &&
      Boolean(state.livekitConfig.hasApiKey) &&
      Boolean(state.livekitConfig.hasApiSecret);
    livekitStatus = isConfigured ? "ok" : "error";
  }

  const runtimeLivekitStatus = getLatestComponentStatus("livekit");
  if (runtimeLivekitStatus !== "unknown") {
    livekitStatus = runtimeLivekitStatus;
  }

  const sarvamStatus = getLatestComponentStatus("sarvam");
  setPillState(ui.livekitStatusPill, "LiveKit", livekitStatus);
  setPillState(ui.sarvamStatusPill, "Sarvam", sarvamStatus);
}

function renderToolLogChat() {
  if (!ui.toolLogChat) {
    return;
  }

  if (!state.runtimeLogs.length) {
    ui.toolLogChat.innerHTML = '<p class="tool-log-item muted">Waiting for runtime logs...</p>';
    return;
  }

  const items = state.runtimeLogs.slice(-18).reverse();
  ui.toolLogChat.innerHTML = items
    .map((entry) => {
      const cls = entry.status === "ok" ? "ok" : "error";
      const stamp = entry.at ? new Date(entry.at).toLocaleTimeString() : "-";
      const details = entry.details ? ` | ${JSON.stringify(entry.details)}` : "";
      return `<p class="tool-log-item ${cls}"><span class="time">${stamp}</span>${entry.component} -> ${entry.action} -> ${entry.status}${details}</p>`;
    })
    .join("");
}

function renderRuntimeLogs() {
  if (!ui.runtimeLogs) {
    return;
  }

  if (!state.runtimeLogs.length) {
    ui.runtimeLogs.textContent = "Waiting for runtime logs...";
    return;
  }

  const lines = state.runtimeLogs
    .slice(-60)
    .reverse()
    .map((entry) => {
      const details = entry.details ? ` | ${JSON.stringify(entry.details)}` : "";
      const stamp = entry.at ? new Date(entry.at).toLocaleTimeString() : "-";
      return `${stamp} | ${entry.component} | ${entry.action} | ${entry.status}${details}`;
    });

  ui.runtimeLogs.textContent = lines.join("\n");
  renderToolLogChat();
  updateToolStatusPills();
}

async function loadRuntimeLogs() {
  try {
    const data = await api("/api/logs");
    state.runtimeLogs = Array.isArray(data.logs) ? data.logs : [];
    renderRuntimeLogs();
  } catch (error) {
    if (ui.runtimeLogs) {
      ui.runtimeLogs.textContent = `Could not load runtime logs: ${error.message || "unknown error"}`;
    }
  }
}

function renderProviderEvents() {
  if (!ui.providerEvents) {
    return;
  }

  if (!state.providerEvents.length) {
    ui.providerEvents.textContent = "-";
    return;
  }

  const lines = state.providerEvents
    .slice(-12)
    .reverse()
    .map((event) => {
      return `${new Date(event.at).toLocaleTimeString()} | ${event.provider} | ${event.type} | ${event.session.status}`;
    });
  ui.providerEvents.textContent = lines.join("\n");
}

async function loadCallHistory() {
  if (!ui.callHistory) {
    return;
  }

  try {
    const data = await api("/api/calls");
    const rows = data.sessions
      .slice(-12)
      .reverse()
      .map((session) => {
        return [
          `${session.callId}`,
          `provider=${session.provider}`,
          `status=${session.status}`,
          `from=${session.from}`,
          `to=${session.to}`,
          `updated=${new Date(session.updatedAt).toLocaleString()}`
        ].join(" | ");
      });
    ui.callHistory.textContent = rows.length ? rows.join("\n") : "No calls yet";
  } catch (error) {
    ui.callHistory.textContent = `Could not load call history: ${error.message || "unknown error"}`;
  }
}

function connectEventStream() {
  const stream = new EventSource("/api/events");
  stream.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.type === "connected") {
        setProviderStatus("Live event stream connected");
        return;
      }

      if (payload.type === "runtime-log" && payload.entry) {
        state.runtimeLogs.push(payload.entry);
        if (state.runtimeLogs.length > 300) {
          state.runtimeLogs.shift();
        }
        renderRuntimeLogs();
        return;
      }

      state.providerEvents.push(payload);
      renderProviderEvents();
      loadCallHistory();

      if (payload.provider === "exotel") {
        setProviderStatus(`Exotel update: ${payload.session.status}`);
      }

      if (state.callId && payload.session?.callId === state.callId) {
        ui.callIdLabel.textContent = `Call ID: ${state.callId}`;
        ui.statusBadge.textContent = `Active call from ${payload.session.from} to ${payload.session.to} (${payload.session.status})`;
      }
    } catch {
      setProviderStatus("Received non-parseable event payload");
    }
  };

  stream.onerror = () => {
    setProviderStatus("Event stream reconnecting...");
  };
}

async function sendExotelMediaTurn() {
  if (!ui.exotelCallSid || !ui.exotelTranscription || !ui.sendExotelTurnBtn) {
    return;
  }

  const callSid = ui.exotelCallSid.value.trim();
  const transcriptionText = ui.exotelTranscription.value.trim();
  const from = ui.exotelFrom ? ui.exotelFrom.value.trim() : "unknown";

  if (!callSid) {
    alert("Exotel Call SID is required");
    return;
  }

  if (!transcriptionText) {
    alert("Transcription text is required");
    return;
  }

  try {
    ui.sendExotelTurnBtn.disabled = true;
    const data = await api("/api/exotel/media/turn", {
      method: "POST",
      body: JSON.stringify({
        callSid,
        from: from || "unknown",
        to: "Awaylable Agent",
        transcriptionText
      })
    });

    ui.knowledgeContext.textContent = data.knowledgeContext;
    ui.ttsPayload.textContent = JSON.stringify(data.tts, null, 2);
    ui.exotelTranscription.value = "";
    setProviderStatus(`Exotel media turn processed for ${callSid}`);
    await loadCallHistory();
  } catch (error) {
    alert(error.message || "Exotel media turn failed");
  } finally {
    ui.sendExotelTurnBtn.disabled = false;
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json"
    },
    ...options
  });

  const data = await response.json();
  if (!response.ok) {
    const message = typeof data.error === "string" ? data.error : "Request failed";
    throw new Error(message);
  }

  return data;
}

ui.startBtn.addEventListener("click", async () => {
  try {
    const from = VIRTUAL_CALLER_ID;
    const to = ui.toInput.value.trim();

    const data = await api("/api/call/start", {
      method: "POST",
      body: JSON.stringify({ from, to })
    });

    state.callId = data.session.callId;
    state.from = data.session.from;
    state.to = data.session.to;

    if (ui.userLane) {
      ui.userLane.innerHTML = "";
    }
    if (ui.agentLane) {
      ui.agentLane.innerHTML = "";
    }
    ui.knowledgeContext.textContent = "-";
    ui.ttsPayload.textContent = "-";
    if (ui.agentAudio) {
      ui.agentAudio.removeAttribute("src");
      ui.agentAudio.load();
    }
    if (ui.audioStatus) {
      ui.audioStatus.textContent = "Agent voice: waiting for response";
    }

    setCallActive(true);
    ui.callIdLabel.textContent = `Call ID: ${state.callId}`;
    ui.statusBadge.textContent = `Simulated call active: ${state.from} -> ${state.to}`;
    await loadCallHistory();
  } catch (error) {
    alert(error.message || "Could not start call");
  }
});

if (ui.startListeningBtn) {
  ui.startListeningBtn.addEventListener("click", startListening);
}

if (ui.stopListeningBtn) {
  ui.stopListeningBtn.addEventListener("click", stopListening);
}

ui.endBtn.addEventListener("click", async () => {
  if (!state.callId) {
    return;
  }

  try {
    await api(`/api/call/${state.callId}/end`, {
      method: "POST"
    });
    stopListening();
    await loadCallHistory();
    setCallActive(false);
    state.callId = null;
  } catch (error) {
    alert(error.message || "Could not end call");
  }
});

if (ui.sendExotelTurnBtn) {
  ui.sendExotelTurnBtn.addEventListener("click", sendExotelMediaTurn);
}

setCallActive(false);
applyFeatureFlags();
connectEventStream();
loadRuntimeLogs();
loadCallHistory();
renderProviderEvents();
renderToolLogChat();
