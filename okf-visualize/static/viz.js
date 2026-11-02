(function () {
  const bundle = window.BUNDLE;
  const bundleName = window.BUNDLE_NAME;
  document.title = `${bundleName} — OKF Viewer`;
  document.getElementById("bundle-name").textContent = bundleName;

  // Populate type filter
  const typeSelect = document.getElementById("filter-type");
  for (const t of bundle.types) {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    typeSelect.appendChild(opt);
  }

  // Build reverse-link index for backlinks
  const backlinks = {};
  for (const edge of bundle.edges) {
    const { source, target } = edge.data;
    (backlinks[target] ||= []).push(source);
  }

  // Look up node label/type by id
  const nodeIndex = {};
  for (const n of bundle.nodes) nodeIndex[n.data.id] = n.data;

  const cy = cytoscape({
    container: document.getElementById("graph"),
    elements: [...bundle.nodes, ...bundle.edges],
    style: [
      {
        selector: "node",
        style: {
          "background-color": "data(color)",
          "label": "data(label)",
          "color": "#0f172a",
          "font-size": 11,
          "text-valign": "bottom",
          "text-margin-y": 4,
          "text-wrap": "wrap",
          "text-max-width": 120,
          "width": "data(size)",
          "height": "data(size)",
          "border-width": 1,
          "border-color": "#0f172a",
        },
      },
      {
        selector: "node:selected",
        style: {
          "border-width": 3,
          "border-color": "#f59e0b",
        },
      },
      {
        selector: "edge",
        style: {
          "width": 1.5,
          "line-color": "#cbd5e1",
          "target-arrow-color": "#cbd5e1",
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
          "arrow-scale": 0.9,
        },
      },
      {
        selector: "edge:selected",
        style: {
          "line-color": "#f59e0b",
          "target-arrow-color": "#f59e0b",
          "width": 2.5,
        },
      },
      {
        selector: ".dim",
        style: { "opacity": 0.15 },
      },
    ],
    layout: { name: "cose", animate: false, padding: 30 },
    wheelSensitivity: 0.2,
  });

  cy.on("tap", "node", (evt) => showDetail(evt.target.id()));
  cy.on("tap", (evt) => {
    if (evt.target === cy) clearSelection();
  });

  document.getElementById("layout").addEventListener("change", (e) => {
    cy.layout({ name: e.target.value, animate: false, padding: 30 }).run();
  });

  document.getElementById("reset").addEventListener("click", () => {
    cy.fit(null, 30);
    clearSelection();
  });

  document.getElementById("search").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) {
      cy.elements().removeClass("dim");
      return;
    }
    cy.nodes().forEach((n) => {
      const d = n.data();
      const hay =
        (d.label || "").toLowerCase() + " " +
        d.id.toLowerCase() + " " +
        (d.tags || []).join(" ").toLowerCase();
      n.toggleClass("dim", !hay.includes(q));
    });
    cy.edges().forEach((edge) => {
      const src = edge.source();
      const tgt = edge.target();
      edge.toggleClass("dim", src.hasClass("dim") || tgt.hasClass("dim"));
    });
  });

  document.getElementById("filter-type").addEventListener("change", (e) => {
    const t = e.target.value;
    if (!t) {
      cy.elements().removeClass("dim");
      return;
    }
    cy.nodes().forEach((n) => {
      n.toggleClass("dim", n.data("type") !== t);
    });
    cy.edges().forEach((edge) => {
      edge.toggleClass("dim", edge.source().hasClass("dim") || edge.target().hasClass("dim"));
    });
  });

  function clearSelection() {
    cy.elements().unselect();
    document.getElementById("detail-empty").hidden = false;
    document.getElementById("detail-content").hidden = true;
  }

  function appendDynamicRow(dl, label, valueNodeOrText) {
    const dt = document.createElement("dt");
    dt.className = "dynamic-fm";
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.className = "dynamic-fm";
    if (typeof valueNodeOrText === "string") {
      dd.textContent = valueNodeOrText;
    } else {
      dd.appendChild(valueNodeOrText);
    }
    dl.appendChild(dt);
    dl.appendChild(dd);
    return dd;
  }

  function showDetail(conceptId) {
    const data = nodeIndex[conceptId];
    if (!data) return;
    cy.elements().unselect();
    const node = cy.getElementById(conceptId);
    if (node) node.select();

    document.getElementById("detail-empty").hidden = true;
    const content = document.getElementById("detail-content");
    content.hidden = false;

    const chip = document.getElementById("detail-type");
    chip.textContent = data.type;
    chip.style.background = data.color;

    document.getElementById("detail-title").textContent = data.label;
    document.getElementById("detail-id").textContent = conceptId;
    document.getElementById("detail-description").textContent = data.description || "—";

    const resourceEl = document.getElementById("detail-resource");
    resourceEl.innerHTML = "";
    if (data.resource) {
      const a = document.createElement("a");
      a.href = data.resource;
      a.textContent = data.resource;
      a.target = "_blank";
      a.rel = "noopener";
      a.className = "external";
      resourceEl.appendChild(a);
    } else {
      resourceEl.textContent = "—";
    }

    const tagsEl = document.getElementById("detail-tags");
    tagsEl.innerHTML = "";
    if (data.tags && data.tags.length) {
      for (const t of data.tags) {
        const span = document.createElement("span");
        span.className = "tag";
        span.textContent = t;
        tagsEl.appendChild(span);
      }
    } else {
      tagsEl.textContent = "—";
    }

    // Dynamic v0.2 metadata display
    const dl = document.querySelector("dl.frontmatter");
    if (dl) {
      const existingDynamics = dl.querySelectorAll(".dynamic-fm");
      existingDynamics.forEach(el => el.remove());

      if (data.status) {
        appendDynamicRow(dl, "Status", data.status);
      }

      if (data.stale_after) {
        const dd = appendDynamicRow(dl, "Stale After", data.stale_after);
        const isStale = new Date(data.stale_after) <= new Date();
        if (isStale) {
          const warning = document.createElement("span");
          warning.style.color = "#dc2626";
          warning.style.fontWeight = "bold";
          warning.style.marginLeft = "8px";
          warning.textContent = "(Stale)";
          dd.appendChild(warning);
        }
      }

      // Trust tier calculation (§5.3)
      let trustTier = "unverified";
      if (data.verified && (Array.isArray(data.verified) ? data.verified.length : Object.keys(data.verified).length)) {
        const verifications = Array.isArray(data.verified) ? data.verified : [data.verified];
        const hasHuman = verifications.some(v => v && v.by && String(v.by).startsWith("human:"));
        trustTier = hasHuman ? "human-reviewed" : "machine-confirmed";
      }
      const trustDd = appendDynamicRow(dl, "Trust Tier", trustTier);
      if (trustTier === "human-reviewed") {
        trustDd.style.color = "#16a34a";
        trustDd.style.fontWeight = "bold";
      } else if (trustTier === "machine-confirmed") {
        trustDd.style.color = "#2563eb";
      } else {
        trustDd.style.color = "#64748b";
      }

      // Generated metadata (§5.2)
      if (data.generated && (data.generated.by || data.generated.at)) {
        const parts = [];
        if (data.generated.by) parts.push(data.generated.by);
        if (data.generated.at) parts.push(`at ${data.generated.at}`);
        appendDynamicRow(dl, "Generated", parts.join(" "));
      }

      // Attested Computation metadata (§10.2)
      if (data.runtime) {
        appendDynamicRow(dl, "Runtime", data.runtime);
      }
      if (data.computation) {
        appendDynamicRow(dl, "Computation", data.computation);
      }
      if (Array.isArray(data.parameters) && data.parameters.length > 0) {
        const paramText = data.parameters
          .map(p => `${p.name}:${p.type || "any"}${p.required ? "*" : ""}`)
          .join(", ");
        appendDynamicRow(dl, "Parameters", paramText);
      }
      if (data.executor && data.executor.resource) {
        const receiptInfo = Array.isArray(data.executor.receipt) ? ` (receipt: ${data.executor.receipt.join(", ")})` : "";
        appendDynamicRow(dl, "Executor", `${data.executor.resource}${receiptInfo}`);
      }
      if (data.attester && data.attester.resource) {
        appendDynamicRow(dl, "Attester", data.attester.resource);
      }

      // Sources list (§5.1: supports both shorthand strings and structured objects)
      if (data.sources && data.sources.length && data.sources[0]) {
        const srcContainer = document.createElement("div");
        data.sources.forEach(src => {
          if (!src) return;
          const div = document.createElement("div");
          div.style.marginBottom = "4px";
          if (typeof src === "string") {
            const a = document.createElement("a");
            a.href = src;
            a.textContent = src;
            a.target = "_blank";
            a.rel = "noopener";
            a.className = "external";
            div.appendChild(a);
          } else {
            if (src.resource) {
              const a = document.createElement("a");
              a.href = src.resource;
              a.textContent = src.title || src.id || src.resource;
              a.target = "_blank";
              a.rel = "noopener";
              a.className = "external";
              div.appendChild(a);
            } else {
              div.textContent = src.title || src.id || "Unnamed source";
            }
            const metaParts = [];
            if (src.author) metaParts.push(`by ${src.author}`);
            if (src.usage_count !== undefined) metaParts.push(`usage: ${src.usage_count}`);
            if (src.last_modified) metaParts.push(`modified: ${src.last_modified}`);
            if (metaParts.length > 0) {
              const metaSpan = document.createElement("span");
              metaSpan.className = "muted";
              metaSpan.style.marginLeft = "6px";
              metaSpan.textContent = `(${metaParts.join(" · ")})`;
              div.appendChild(metaSpan);
            }
          }
          srcContainer.appendChild(div);
        });
        appendDynamicRow(dl, "Sources", srcContainer);
      }

      if (data.usage_window && (data.usage_window.from || data.usage_window.to)) {
        appendDynamicRow(dl, "Usage Window", `${data.usage_window.from || "?"} → ${data.usage_window.to || "?"}`);
      }
    }

    const body = bundle.bodies[conceptId] || "";
    const html = marked.parse(body, { breaks: false, gfm: true });
    const bodyEl = document.getElementById("detail-body");
    bodyEl.innerHTML = html;
    rewriteInternalLinks(bodyEl);

    const bl = backlinks[conceptId] || [];
    const blSection = document.getElementById("detail-backlinks");
    const blList = document.getElementById("backlinks-list");
    blList.innerHTML = "";
    if (bl.length) {
      blSection.hidden = false;
      for (const src of bl) {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.textContent = nodeIndex[src]?.label || src;
        a.dataset.target = src;
        a.addEventListener("click", () => showDetail(src));
        li.appendChild(a);
        const muted = document.createElement("span");
        muted.className = "muted";
        muted.textContent = ` (${src})`;
        li.appendChild(muted);
        blList.appendChild(li);
      }
    } else {
      blSection.hidden = true;
    }

    cy.animate({ center: { eles: node }, zoom: Math.max(cy.zoom(), 1.0) }, { duration: 200 });
  }

  function rewriteInternalLinks(root) {
    root.querySelectorAll("a[href]").forEach((a) => {
      const href = a.getAttribute("href");
      if (!href) return;
      if (href.startsWith("/") && href.endsWith(".md")) {
        const target = href.slice(1, -3);
        if (nodeIndex[target]) {
          a.className = "internal";
          a.setAttribute("href", "javascript:void(0)");
          a.addEventListener("click", (e) => {
            e.preventDefault();
            showDetail(target);
          });
          return;
        }
      }
      a.className = "external";
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener");
    });
  }

  // Auto-show the first node (a dataset if available, else first concept)
  const initial =
    bundle.nodes.find((n) => n.data.type === "BigQuery Dataset") ||
    bundle.nodes[0];
  if (initial) showDetail(initial.data.id);
})();
