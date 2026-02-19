(function () {
  function el(id) {
    return document.getElementById(id);
  }

  function buildQuery() {
    var query = new URLSearchParams({ limit: "150" });
    var type = String((el("contentTypeInput") || {}).value || "").trim();
    var kind = String((el("contentKindInput") || {}).value || "").trim();
    var published = String((el("contentPublishedInput") || {}).value || "").trim();
    if (type) query.set("type", type);
    if (kind) query.set("kind", kind);
    if (published) query.set("isPublished", published);
    return query.toString();
  }

  function renderRows(items) {
    el("contentTableBody").innerHTML =
      (items || [])
        .map(function (item) {
          var nextState = !item.is_published;
          var nextLabel = item.is_published ? "Unpublish" : "Publish";
          return (
            "<tr><td>" +
            item.id +
            "</td><td>" +
            AdminCore.esc(item.type || "-") +
            " / " +
            AdminCore.esc(item.kind || "-") +
            "</td><td>" +
            AdminCore.esc(item.title || "-") +
            "</td><td>" +
            AdminCore.esc(item.major || "-") +
            " / " +
            AdminCore.esc(item.term || "-") +
            "</td><td>" +
            AdminCore.statusPill(item.is_published ? "published" : "unpublished") +
            "</td><td>" +
            AdminCore.esc(item.created_at || "") +
            "</td><td><div class='toolbar'><button class='btn ghost content-detail' data-id='" +
            item.id +
            "'>Detail</button><button class='btn content-toggle' data-id='" +
            item.id +
            "' data-next='" +
            nextState +
            "'>" +
            nextLabel +
            "</button></div></td></tr>"
          );
        })
        .join("") || "<tr><td colspan='7'>No content records.</td></tr>";
  }

  async function loadContent() {
    var data = await AdminCore.api("/api/admin/content?" + buildQuery());
    renderRows(data.items || []);
  }

  async function loadDetail(id) {
    var data = await AdminCore.api("/api/admin/content/" + id);
    el("contentDetailBox").textContent = AdminCore.toPretty(data);
  }

  async function setPublishState(id, isPublished) {
    await AdminCore.api("/api/admin/content/" + id + "/publish", {
      method: "PATCH",
      body: { isPublished: Boolean(isPublished) }
    });
  }

  function bindActions() {
    el("contentLoadBtn").addEventListener("click", function () {
      loadContent()
        .then(function () {
          AdminCore.setStatus("Content list loaded.", "ok");
        })
        .catch(function (error) {
          AdminCore.setStatus(error.message || "Failed to load content list.", "bad");
        });
    });

    el("contentTableBody").addEventListener("click", function (event) {
      var detailBtn = event.target.closest(".content-detail");
      var toggleBtn = event.target.closest(".content-toggle");
      if (!detailBtn && !toggleBtn) return;

      if (detailBtn) {
        var detailId = Number(detailBtn.dataset.id);
        if (!detailId) return;
        loadDetail(detailId)
          .then(function () {
            AdminCore.setStatus("Content detail loaded.", "ok");
          })
          .catch(function (error) {
            AdminCore.setStatus(error.message || "Failed to load content detail.", "bad");
          });
        return;
      }

      var toggleId = Number(toggleBtn.dataset.id);
      var nextState = String(toggleBtn.dataset.next) === "true";
      if (!toggleId) return;
      setPublishState(toggleId, nextState)
        .then(function () {
          return Promise.all([loadContent(), loadDetail(toggleId)]);
        })
        .then(function () {
          AdminCore.setStatus("Content publish status updated.", "ok");
        })
        .catch(function (error) {
          AdminCore.setStatus(error.message || "Failed to update publish status.", "bad");
        });
    });
  }

  document.addEventListener("DOMContentLoaded", bindActions);

  window.addEventListener("admin:auth-ready", function () {
    loadContent().catch(function (error) {
      AdminCore.setStatus(error.message || "Failed to load content data.", "bad");
    });
  });
})();
