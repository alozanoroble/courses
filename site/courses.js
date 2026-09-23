// Renders courses.json (built by scripts/fetch_courses.py) as filterable
// tiles. Every course and lecture links straight to YouTube.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var state = { data: null, group: "all", q: "" };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function seconds(len) {
    if (!len) return 0;
    return len.split(":").reduce(function (a, p) { return a * 60 + (+p || 0); }, 0);
  }
  function hours(sec) {
    var h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
    if (m === 60) { h += 1; m = 0; }
    return h ? h + " h" + (m ? " " + m + " min" : "") : m + " min";
  }
  function norm(s) { return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function slug(s) { return norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
  function thumb(id) { return "https://i.ytimg.com/vi/" + id + "/mqdefault.jpg"; }
  function playlistUrl(c) { return "https://www.youtube.com/playlist?list=" + c.id; }
  function videoUrl(c, v, i) { return "https://www.youtube.com/watch?v=" + v.id + "&list=" + c.id + "&index=" + (i + 1); }
  function meta(c) {
    var bits = [];
    if (c.by) bits.push(c.by);
    if (c.year) bits.push("CTNT " + c.year);
    return bits.join(" · ");
  }

  function renderChips() {
    var chips = $("chips");
    var opts = [{ key: "all", name: "All" }].concat(state.data.groups.map(function (g) { return { key: slug(g.name), name: g.name }; }));
    opts.forEach(function (o) {
      var b = el("button", "chip", o.name);
      b.type = "button";
      b.setAttribute("role", "tab");
      b.dataset.key = o.key;
      b.setAttribute("aria-selected", o.key === state.group);
      b.addEventListener("click", function () {
        state.group = o.key;
        [].forEach.call(document.querySelectorAll(".chip"), function (x) { x.setAttribute("aria-selected", x.dataset.key === state.group); });
        render();
      });
      chips.appendChild(b);
    });
  }

  // A course matches on its own title/lecturer/year, or through its lectures.
  function matches(c, q) {
    if (!q) return { ok: true, hits: [] };
    if (norm(c.title + " " + (c.by || "") + " " + (c.year || "")).indexOf(q) >= 0) return { ok: true, hits: [] };
    var hits = [];
    c.videos.forEach(function (v, i) { if (norm(v.title).indexOf(q) >= 0) hits.push(i); });
    return { ok: hits.length > 0, hits: hits };
  }

  function card(c, hits) {
    var total = c.videos.reduce(function (a, v) { return a + seconds(v.length); }, 0);
    var wrap = el("div", "c-card");
    var a = el("a", "course");
    a.href = playlistUrl(c);
    var t = el("span", "c-thumb");
    var img = el("img");
    img.src = thumb(c.videos[0].id);
    img.alt = "";
    img.loading = "lazy";
    img.width = 320; img.height = 180;
    t.appendChild(img);
    t.appendChild(el("span", "c-count", c.videos.length + (c.videos.length === 1 ? " lecture" : " lectures")));
    a.appendChild(t);
    var body = el("span", "c-body");
    body.appendChild(el("span", "c-title", c.title));
    var m = meta(c);
    if (m) body.appendChild(el("span", "c-meta", m));
    body.appendChild(el("span", "c-len", (total ? hours(total) + " · " : "") + "on YouTube ↗"));
    a.appendChild(body);
    wrap.appendChild(a);
    if (hits.length) {
      wrap.appendChild(el("p", "c-hits-label", hits.length + (hits.length === 1 ? " matching lecture" : " matching lectures")));
      var ul = el("ul", "c-hits");
      hits.slice(0, 8).forEach(function (i) {
        var v = c.videos[i], li = el("li"), l = el("a");
        l.href = videoUrl(c, v, i);
        l.appendChild(el("span", null, v.title));
        if (v.length) l.appendChild(el("span", "lec-l", v.length));
        li.appendChild(l);
        ul.appendChild(li);
      });
      wrap.appendChild(ul);
    }
    return wrap;
  }

  function render() {
    var groups = $("groups"), q = norm(state.q.trim()), shown = 0;
    groups.textContent = "";
    state.data.groups.forEach(function (g) {
      if (state.group !== "all" && state.group !== slug(g.name)) return;
      var grid = el("div", "c-grid");
      g.courses.forEach(function (c) {
        var m = matches(c, q);
        if (!m.ok) return;
        grid.appendChild(card(c, m.hits));
        shown++;
      });
      if (!grid.children.length) return;
      var sec = el("section", "c-group");
      sec.id = slug(g.name);
      sec.appendChild(el("h2", null, g.name));
      if (g.note) sec.appendChild(el("p", "section-note", g.note));
      sec.appendChild(grid);
      groups.appendChild(sec);
    });
    $("empty").hidden = shown > 0;
  }

  $("q").addEventListener("input", function (e) { state.q = e.target.value; render(); });

  fetch("courses.json").then(function (r) { return r.json(); }).then(function (data) {
    state.data = data;
    var n = 0, lec = 0, sec = 0;
    data.groups.forEach(function (g) { g.courses.forEach(function (c) {
      n++; lec += c.videos.length;
      c.videos.forEach(function (v) { sec += seconds(v.length); });
    }); });
    $("stats").textContent = n + " courses · " + lec + " lectures · about " + Math.round(sec / 3600) + " hours of mathematics";
    $("gen").textContent = data.generated;
    renderChips();
    render();
  }).catch(function () {
    $("groups").textContent = "Could not load the course list.";
  });
})();
