(function () {
  var rowsCache = [];

  function el(id) {
    return document.getElementById(id);
  }

  function buildQuery() {
    var query = new URLSearchParams({ limit: "200" });
    var type = String((el("contentTypeInput") || {}).value || "").trim();
    var kind = String((el("contentKindInput") || {}).value || "").trim();
    var published = String((el("contentPublishedInput") || {}).value || "").trim();
    if (type) query.set("type", type);
    if (kind) query.set("kind", kind);
    if (published) query.set("isPublished", published);
    return query.toString();
  }

  function filterRows(items) {
    var search = String((el("contentSearchInput") || {}).value || "").trim().toLowerCase();
    if (!search) return (items || []).slice();
    return (items || []).filter(function (item) {
      var title = String(item.title || "").toLowerCase();
      var kind = String(item.kind || "").toLowerCase();
      var type = String(item.type || "").toLowerCase();
      var id = String(item.id || "");
      return title.includes(search) || kind.includes(search) || type.includes(search) || id.includes(search);
    });
  }

  function selectedIds() {
    return Array.from(document.querySelectorAll(".content-select:checked"))
      .map(function (node) {
        return Number(node.value);
      })
      .filter(function (id) {
        return Number.isFinite(id) && id > 0;
      });
  }

  function renderRows(items) {
    rowsCache = (items || []).slice();
    var filtered = filterRows(rowsCache);

    el("contentTableBody").innerHTML =
      filtered
        .map(function (item) {
          var nextState = !item.is_published;
          var nextLabel = item.is_published ? "Unpublish" : "Publish";
          return (
            "<tr><td><input class='content-select' type='checkbox' value='" +
            item.id +
            "' /></td><td>" +
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
        .join("") || "<tr><td colspan='8'>No content records.</td></tr>";
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

  async function bulkPublish(nextState) {
    var ids = selectedIds();
    if (!ids.length) {
      AdminCore.setStatus("Select at least one content row.", "warn");
      return;
    }

    var results = await Promise.allSettled(
      ids.map(function (id) {
        return setPublishState(id, nextState);
      })
    );

    var okCount = results.filter(function (result) {
      return result.status === "fulfilled";
    }).length;
    var failCount = results.length - okCount;
    await loadContent();
    AdminCore.setStatus(
      "Bulk publish update complete. Success: " + okCount + " | Failed: " + failCount,
      failCount ? "warn" : "ok"
    );
  }

  function exportRows() {
    AdminCore.downloadCsv(
      "content-library.csv",
      [
        { key: "id", label: "id" },
        { key: "type", label: "type" },
        { key: "kind", label: "kind" },
        { key: "title", label: "title" },
        { key: "major", label: "major" },
        { key: "term", label: "term" },
        { key: "is_published", label: "is_published" },
        { key: "created_at", label: "created_at" }
      ],
      filterRows(rowsCache)
    );
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

    el("contentPublishSelectedBtn").addEventListener("click", function () {
      bulkPublish(true).catch(function (error) {
        AdminCore.setStatus(error.message || "Bulk publish failed.", "bad");
      });
    });

    el("contentUnpublishSelectedBtn").addEventListener("click", function () {
      bulkPublish(false).catch(function (error) {
        AdminCore.setStatus(error.message || "Bulk unpublish failed.", "bad");
      });
    });

    el("contentExportBtn").addEventListener("click", function () {
      exportRows();
      AdminCore.toast("Content CSV exported.", "ok");
    });

    el("contentSearchInput").addEventListener(
      "input",
      AdminCore.debounce(function () {
        renderRows(rowsCache);
      }, 220)
    );

    el("contentSelectAll").addEventListener("change", function (event) {
      var checked = Boolean(event.target.checked);
      Array.from(document.querySelectorAll(".content-select")).forEach(function (node) {
        node.checked = checked;
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
