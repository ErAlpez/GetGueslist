(() => {
  const cacheKey = "venguestpass-offline-guestlist-v1";
  const queueKey = "venguestpass-offline-guestlist-queue-v1";
  const identityKey = "venguestpass-offline-identity-v1";
  const statusElement = document.getElementById("status");
  const registrationsElement = document.getElementById("registrations");
  const pendingElement = document.getElementById("pending");
  const eventSelect = document.getElementById("event-id");
  const form = document.getElementById("offline-add");
  const snapshotSection = document.getElementById("snapshot-section");
  const addSection = document.getElementById("add-section");

  function readJson(key) {
    const value = localStorage.getItem(key);
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch (error) {
      console.error("Offline attendee data could not be parsed.", error);
      return null;
    }
  }

  const identity = readJson(identityKey);
  const snapshot = readJson(cacheKey);
  const isMatchingSnapshot = Boolean(
    identity &&
    snapshot &&
    identity.userId === snapshot.userId &&
    identity.workspaceId === snapshot.workspaceId,
  );
  const workspaceId = isMatchingSnapshot ? identity.workspaceId : "";
  const workspaceName = document.getElementById("workspace-name");

  function setStatus(message) {
    statusElement.textContent = message;
  }

  function readQueue() {
    const queue = readJson(queueKey);
    return Array.isArray(queue)
      ? queue.filter((item) => item && typeof item.id === "string" && typeof item.userId === "string")
      : [];
  }

  function createRow(title, detail) {
    const row = document.createElement("article");
    row.className = "offline-row";
    const heading = document.createElement("strong");
    heading.textContent = title;
    const small = document.createElement("small");
    small.textContent = detail;
    row.append(heading, small);
    return row;
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
  }

  function renderRegistrations() {
    registrationsElement.replaceChildren();
    if (!isMatchingSnapshot) {
      snapshotSection.hidden = true;
      addSection.hidden = true;
      setStatus("No attendee snapshot is available for this signed-in account and workspace. Open Attendees while online first.");
      return;
    }

    snapshotSection.hidden = false;
    addSection.hidden = !Array.isArray(snapshot.events) || snapshot.events.length === 0;
    workspaceName.textContent = snapshot.workspaceName || "Offline attendee list";
    document.getElementById("snapshot-time").textContent = `Saved ${formatDate(snapshot.cachedAt)}. Only the most recently loaded page is available offline.`;
    eventSelect.replaceChildren();
    for (const event of snapshot.events) {
      const option = document.createElement("option");
      option.value = event.id;
      option.textContent = event.name;
      eventSelect.append(option);
    }

    const query = document.getElementById("search").value.trim().toLowerCase();
    const rows = Array.isArray(snapshot.registrations) ? snapshot.registrations : [];
    const filteredRows = rows.filter((item) =>
      `${item.firstName} ${item.lastName} ${item.email || ""} ${item.eventName}`.toLowerCase().includes(query),
    );
    if (filteredRows.length === 0) {
      const empty = document.createElement("p");
      empty.className = "offline-empty";
      empty.textContent = rows.length ? "No saved attendees match that search." : "No attendees were in the last saved page.";
      registrationsElement.append(empty);
      return;
    }
    for (const item of filteredRows) {
      const detail = [
        item.eventName,
        item.category.toLowerCase().replaceAll("_", " "),
        item.rsvpStatus.toLowerCase(),
        item.ticketId ? `Ticket ${item.ticketId}` : "",
        formatDate(item.registeredAt),
        item.checkedInAt ? `Checked in ${formatDate(item.checkedInAt)}` : "",
      ].filter(Boolean).join(" · ");
      registrationsElement.append(createRow(`${item.firstName} ${item.lastName}`, `${item.email || "No email"} · ${detail}`));
    }
  }

  function renderQueue() {
    pendingElement.replaceChildren();
    const visibleQueue = readQueue().filter((item) =>
      item.userId === identity.userId && item.workspaceId === workspaceId,
    );
    if (visibleQueue.length === 0) {
      const empty = document.createElement("p");
      empty.className = "offline-empty";
      empty.textContent = "No guest registrations are waiting to sync.";
      pendingElement.append(empty);
      return;
    }
    for (const item of visibleQueue) {
      pendingElement.append(createRow(
        `${item.firstName} ${item.lastName} · ${item.eventName}`,
        item.error || `Queued ${formatDate(item.queuedAt)} · waiting for server confirmation.`,
      ));
    }
  }

  async function syncQueue() {
    if (!workspaceId || !navigator.onLine) {
      if (workspaceId) setStatus("Offline. Changes are saved on this device and will sync when you reconnect.");
      renderQueue();
      return;
    }

    const queue = readQueue();
    let synced = 0;
    for (const item of [...queue]) {
      if (item.userId !== identity.userId || item.workspaceId !== workspaceId) continue;
      let response;
      try {
        response = await fetch("/api/guestlist/offline-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            offlineSyncId: item.id,
            workspaceId: item.workspaceId,
            eventId: item.eventId,
            firstName: item.firstName,
            lastName: item.lastName,
            email: item.email,
            phone: item.phone,
            age: item.age,
            gender: item.gender,
            category: item.category,
          }),
          cache: "no-store",
        });
      } catch (error) {
        console.warn("Offline guest registration sync could not reach the server.", error);
        item.error = "Waiting for a connection to sync this guest.";
        break;
      }

      if (response.ok) {
        const index = queue.findIndex((entry) => entry.id === item.id);
        if (index >= 0) queue.splice(index, 1);
        synced += 1;
        continue;
      }

      try {
        const body = await response.json();
        item.error = typeof body.error === "string" ? body.error : `Sync failed with HTTP ${response.status}.`;
      } catch (error) {
        console.warn("Offline guest registration error response could not be read.", error);
        item.error = `Sync failed with HTTP ${response.status}.`;
      }
    }

    try {
      localStorage.setItem(queueKey, JSON.stringify(queue));
    } catch (error) {
      console.error("Offline guest registration queue could not be updated after sync.", error);
      renderQueue();
      setStatus("Sync finished, but this device could not update its saved queue. Reconnect and sync again to confirm.");
      return;
    }
    renderQueue();
    if (synced > 0) {
      setStatus(`${synced} guest registration${synced === 1 ? "" : "s"} synced. Reload the attendee list to see confirmed guests.`);
    } else if (queue.some((item) =>
      item.userId === identity.userId && item.workspaceId === workspaceId && item.error,
    )) {
      setStatus("Some queued guests need attention. Their details are still saved on this device.");
    } else {
      setStatus("Online. Your saved attendee snapshot is ready.");
    }
  }

  document.getElementById("search").addEventListener("input", renderRegistrations);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!isMatchingSnapshot || !navigator.onLine && !workspaceId) return;
    const formData = new FormData(form);
    const selectedEvent = snapshot.events.find((item) => item.id === formData.get("eventId"));
    if (!selectedEvent) {
      setStatus("Choose an event from the saved list.");
      return;
    }
    const queue = readQueue();
    if (queue.filter((item) =>
      item.userId === identity.userId && item.workspaceId === workspaceId,
    ).length >= 100) {
      setStatus("The offline queue is full. Reconnect and sync before adding more guests.");
      return;
    }
    const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    queue.push({
      id,
      userId: identity.userId,
      workspaceId,
      eventId: selectedEvent.id,
      eventName: selectedEvent.name,
      firstName: String(formData.get("firstName") || "").trim(),
      lastName: String(formData.get("lastName") || "").trim(),
      email: String(formData.get("email") || "").trim().toLowerCase(),
      phone: String(formData.get("phone") || "").trim(),
      age: String(formData.get("age") || ""),
      gender: String(formData.get("gender") || ""),
      category: String(formData.get("category") || "GENERAL"),
      queuedAt: new Date().toISOString(),
    });
    try {
      localStorage.setItem(queueKey, JSON.stringify(queue));
    } catch (error) {
      console.error("Offline guest registration could not be saved.", error);
      setStatus("This guest could not be saved on this device. Check available storage and try again.");
      return;
    }
    form.reset();
    renderQueue();
    setStatus("Guest saved on this device. The server will validate and register them when you reconnect.");
    void syncQueue();
  });

  if (!workspaceId) {
    snapshotSection.hidden = true;
    addSection.hidden = true;
    setStatus("No saved workspace identity is available. Sign in and open Attendees while online before working offline.");
  } else {
    renderRegistrations();
    renderQueue();
    void syncQueue();
  }
  window.addEventListener("online", syncQueue);
  window.addEventListener("offline", () => {
    setStatus("Offline. Changes are saved on this device and will sync when you reconnect.");
  });
})();
