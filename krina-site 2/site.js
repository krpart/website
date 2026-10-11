/* Krina Patel — reads content.json and builds whichever page is open.
   Each page file (index.html, about.html, ...) says which page it is in <body data-page="...">.
   All words, links and images live in content.json (edited through Pages CMS).
   No libraries, nothing loaded from other websites. */
(function () {
  "use strict";

  var root = document.documentElement;
  var FORM_ENDPOINT = "https://api.web3forms.com/submit";

  // Menu order and the file each menu item opens.
  var PAGES = [
    { key: "about", file: "about.html" },
    { key: "studio", file: "studio.html" },
    { key: "research", file: "research.html" },
    { key: "books", file: "books.html" },
    { key: "contact", file: "contact.html" }
  ];

  /* ---------- small helpers ---------- */

  function h(tag, attrs, kids) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === "class") node.className = v;
        else node.setAttribute(k, v === true ? "" : v);
      });
    }
    add(node, kids);
    return node;
  }

  function add(node, kids) {
    if (kids === null || kids === undefined || kids === false) return;
    if (!Array.isArray(kids)) kids = [kids];
    kids.forEach(function (k) {
      if (k === null || k === undefined || k === false || k === "") return;
      if (Array.isArray(k)) { add(node, k); return; }
      node.appendChild(typeof k === "string" ? document.createTextNode(k) : k);
    });
  }

  function str(v) { return typeof v === "string" ? v.trim() : ""; }
  function list(v) { return Array.isArray(v) ? v : []; }
  function obj(v) { return v && typeof v === "object" ? v : {}; }
  function num(v) { var n = Number(v); return isFinite(n) && n > 0 ? Math.round(n) : 0; }
  function on(section) { return !!section && section.show === true; }

  // Pages CMS writes file paths as "/images/x.webp". The site may sit in a
  // sub-folder (github.io/<repo>/), so treat file paths as relative to the page.
  function asset(path) {
    path = str(path);
    if (!path) return "";
    if (/^(https?:)?\/\//i.test(path)) return path;
    return path.replace(/^\/+/, "");
  }

  function href(url) {
    url = str(url);
    if (!url) return "";
    if (/^(https?:|mailto:|tel:|#)/i.test(url)) return url;
    if (/^www\./i.test(url) || /^[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|org|net|art|in|co|edu|io|uk|us)(\/|$)/i.test(url)) return "https://" + url;
    return asset(url);
  }

  function link(url, text, cls) {
    return h("a", { href: href(url), class: cls }, text);
  }

  // Turns a plain sentence into text + <i> + <a>, using a section's
  // "Words in italics" and "Linked words" lists. No HTML is stored in content.
  function richText(text, links, italics, usedLinks) {
    text = str(text);
    var marks = [];
    list(links).forEach(function (l) {
      var t = l && str(l.text), u = l && str(l.url);
      if (!t || !u || (usedLinks && usedLinks[t])) return;
      var i = text.indexOf(t);
      if (i >= 0) {
        marks.push({ s: i, e: i + t.length, url: u });
        if (usedLinks) usedLinks[t] = true;
      }
    });
    list(italics).forEach(function (t) {
      t = str(t);
      if (!t) return;
      var from = 0, i;
      while ((i = text.indexOf(t, from)) >= 0) {
        marks.push({ s: i, e: i + t.length, it: true });
        from = i + t.length;
      }
    });
    marks.sort(function (a, b) { return a.s - b.s || b.e - a.e; });
    var out = [], pos = 0;
    marks.forEach(function (m) {
      if (m.s < pos) return;
      if (m.s > pos) out.push(text.slice(pos, m.s));
      var piece = text.slice(m.s, m.e);
      out.push(m.url ? link(m.url, piece) : h("i", null, piece));
      pos = m.e;
    });
    if (pos < text.length) out.push(text.slice(pos));
    return out;
  }

  function paragraphs(items, links, italics) {
    var used = {};
    return list(items).map(function (p) {
      return str(p) ? h("p", null, richText(p, links, italics, used)) : null;
    });
  }

  // <picture> that sends phones the 800px file and larger screens the 1600px file.
  function picture(item, opts) {
    opts = opts || {};
    var large = asset(item.image), small = asset(item.image_small);
    var w = num(item.width), ht = num(item.height);
    var img = document.createElement("img");
    img.setAttribute("alt", str(item.alt));
    img.setAttribute("decoding", "async");
    img.setAttribute("loading", opts.eager ? "eager" : "lazy");
    if (opts.eager) img.setAttribute("fetchpriority", "high");
    if (w && ht) { img.setAttribute("width", w); img.setAttribute("height", ht); }
    if (small && w && ht) {
      var sw = Math.round(w * 800 / Math.max(w, ht));
      img.setAttribute("sizes", opts.sizes || "100vw");
      img.setAttribute("srcset", small + " " + sw + "w, " + large + " " + w + "w");
      img.setAttribute("src", large);
      return h("picture", null, [h("source", { media: "(max-width: 599px)", srcset: small }), img]);
    }
    img.setAttribute("src", large || small);
    return img;
  }

  // The first block of a page: the page title, then its content, in the 680px column.
  function pageTop(title, kids) {
    var col = h("div", { class: "measure" }, h("h1", { class: "page-title" }, title));
    add(col, kids);
    return h("section", { class: "wrap" }, col);
  }

  // A later block on a page: a hairline, a heading, then its content.
  function block(id, heading, kids) {
    var col = h("div", { class: "measure ruled" }, heading ? h("h2", { id: id + "-h" }, heading) : null);
    add(col, kids);
    return h("section", { id: id, class: "wrap", "aria-labelledby": heading ? id + "-h" : null }, col);
  }

  function buttons(links) {
    var items = list(links).filter(function (l) { return l && str(l.url) && str(l.label); });
    if (!items.length) return null;
    return h("div", { class: "button-row" }, items.map(function (l) {
      return h("a", { class: "button", href: href(l.url) }, str(l.label));
    }));
  }

  function cover(k, size) {
    if (str(k.cover)) {
      return h("div", { class: "cover" }, picture({
        image: k.cover, width: k.cover_width, height: k.cover_height,
        alt: str(k.cover_alt) || "Cover of " + str(k.title)
      }, { sizes: size }));
    }
    return h("div", { class: "cover" }, h("div", { class: "cover-placeholder", "aria-hidden": "true" }, str(k.title)));
  }

  function bookTitle(k, level) {
    return h("div", null, [
      h(level, { class: "book-title" }, str(k.title)),
      str(k.subtitle) ? h("p", { class: "book-subtitle" }, str(k.subtitle)) : null
    ]);
  }

  /* ---------- header and footer ---------- */

  function header(d, page) {
    var navItems = PAGES.filter(function (p) { return on(d[p.key]); }).map(function (p) {
      return h("li", null, h("a", { href: p.file, "aria-current": p.key === page ? "page" : null }, str(d[p.key].heading) || p.key));
    });
    var name = str(d.site.name);
    var nameNode = page === "home"
      ? h("h1", { class: "site-name" }, name)
      : h("a", { class: "site-name", href: "index.html" }, name);
    return h("header", { class: "site-header" }, h("div", { class: "wrap header-inner" }, [
      nameNode,
      navItems.length ? h("nav", { class: "site-nav", "aria-label": "Pages" }, h("ul", null, navItems)) : null
    ]));
  }

  function socialLinks(s, cls) {
    var items = [];
    if (str(s.instagram)) items.push(link(s.instagram, "Instagram", "tap-link"));
    if (str(s.linkedin)) items.push(link(s.linkedin, "LinkedIn", "tap-link"));
    return items.length ? h("p", { class: cls }, items) : null;
  }

  function footer(d) {
    return h("footer", { class: "site-footer" }, h("div", { class: "wrap footer-inner" }, [
      h("p", null, str(d.site.copyright)),
      socialLinks(d.site, "link-row")
    ]));
  }

  /* ---------- Home ---------- */

  function home(d) {
    var hm = obj(d.home), o = obj(hm.opening), parts = [];
    var intro = [];
    if (str(d.site.tagline)) intro.push(h("p", { class: "home-tagline wrap" }, str(d.site.tagline)));
    if (on(o) && str(o.image)) {
      var w = num(o.width), ht = num(o.height), r = w && ht ? w / ht : 0.72;
      var caption = str(o.title) || str(o.detail)
        ? h("figcaption", { class: "caption" }, [
            str(o.title) ? h("i", { class: "title-line" }, str(o.title)) : null,
            str(o.title) && str(o.detail) ? ", " : null,
            str(o.detail)
          ])
        : null;
      intro.push(h("div", { class: "opening wrap" }, h("figure", { style: "--r:" + r.toFixed(4) }, [
        picture(o, { eager: true, sizes: "min(100vw, " + (75 * r).toFixed(1) + "vh)" }),
        caption
      ])));
    }
    parts.push(h("section", { class: "home-intro", "aria-label": "Featured artwork" }, intro));

    var st = obj(hm.statement);
    if (on(st) && str(st.text)) {
      parts.push(h("section", { class: "statement wrap", "aria-label": "Statement" }, h("p", null, str(st.text))));
    }

    var bk = obj(hm.book), first = list(obj(d.books).items)[0];
    if (on(bk) && first && str(first.title)) {
      parts.push(block("book", str(bk.heading), h("div", { class: "feature" }, [
        cover(first, "180px"),
        h("div", { class: "book-text" }, [
          bookTitle(first, "h3"),
          str(first.description) ? h("p", null, str(first.description)) : null,
          buttons(first.links)
        ])
      ])));
    }
    return parts;
  }

  /* ---------- About ---------- */

  function about(a) {
    var kids = [];
    var p = obj(a.portrait);
    if (on(p) && str(p.image)) {
      kids.push(h("figure", { class: "portrait" }, [
        picture(p, { sizes: "320px" }),
        str(p.caption) ? h("figcaption", { class: "caption" }, str(p.caption)) : null
      ]));
    }
    kids.push(h("div", { class: "flow" }, paragraphs(a.paragraphs, a.links, a.italics)));
    var cv = obj(a.cv);
    if (on(cv) && str(cv.file)) {
      kids.push(h("p", { class: "cv" }, h("a", { class: "button", href: asset(cv.file) }, str(cv.label) || "Download CV (PDF)")));
    }
    var parts = [pageTop(str(a.heading), kids)];

    var pr = obj(a.projects);
    var rows = list(pr.items).filter(function (x) { return x && str(x.title); });
    if (on(pr) && rows.length) {
      parts.push(block("projects", str(pr.heading), h("ol", { class: "timeline" }, rows.map(function (x) {
        var title = x.italic_title ? h("i", null, str(x.title)) : str(x.title);
        return h("li", null, [
          h("span", { class: "year" }, str(x.year)),
          h("span", null, [
            str(x.link) ? h("a", { href: href(x.link) }, title) : title,
            str(x.detail) ? ", " + str(x.detail) : null
          ])
        ]);
      }))));
    }
    return parts;
  }

  /* ---------- Studio ---------- */

  function artCaption(a) {
    var first = [h("i", null, str(a.title))];
    if (str(a.year)) first.push(", " + str(a.year));
    return [
      h("span", { class: "line title-line" }, first),
      str(a.medium) ? h("span", { class: "line" }, str(a.medium)) : null,
      str(a.size) ? h("span", { class: "line" }, str(a.size)) : null
    ];
  }

  function studio(s, d, viewer) {
    // The opening artwork on the home page isn't repeated here.
    var opening = obj(obj(d.home).opening);
    var skip = on(opening) ? asset(opening.image) : "";
    var works = list(s.artworks).filter(function (a) {
      return a && str(a.image) && asset(a.image) !== skip;
    });
    viewer.setItems(works);
    var figures = works.map(function (a, i) {
      var w = num(a.width), ht = num(a.height);
      var wide = w && ht && w / ht > 1.15;   // landscape works span two columns
      var btn = h("button", { type: "button", class: "art-open", "aria-label": "View larger: " + str(a.title) },
        picture(a, { sizes: wide ? "(min-width: 1024px) 650px, (min-width: 600px) 90vw, 100vw" : "(min-width: 1024px) 320px, (min-width: 600px) 45vw, 100vw" }));
      btn.addEventListener("click", function () { viewer.open(i, btn); });
      return h("figure", { class: wide ? "wide" : null }, [btn, h("figcaption", { class: "caption" }, artCaption(a))]);
    });
    var top = pageTop(str(s.heading), h("div", { class: "flow" }, paragraphs(s.paragraphs)));
    top.firstChild.classList.add("section-intro");
    if (figures.length) top.appendChild(h("div", { class: "gallery" }, figures));
    return [top];
  }

  /* ---------- Research ---------- */

  function research(r) {
    var note = str(r.note) || str(r.note_quote)
      ? h("div", { class: "note" }, [
          str(r.note) ? h("p", null, richText(r.note, null, r.italics)) : null,
          str(r.note_quote) ? h("blockquote", null, h("p", null, str(r.note_quote))) : null
        ])
      : null;
    return [pageTop(str(r.heading), [
      str(r.title) ? h("h2", { class: "essay-title" }, h("i", null, str(r.title))) : null,
      h("div", { class: "flow" }, paragraphs(r.paragraphs, null, r.italics)),
      note
    ])];
  }

  /* ---------- Books ---------- */

  function books(b) {
    var cards = list(b.items).filter(function (k) { return k && str(k.title); }).map(function (k) {
      return h("article", { class: "book" }, [
        cover(k, "200px"),
        bookTitle(k, "h2"),
        str(k.description) ? h("p", null, str(k.description)) : null,
        buttons(k.links),
        b.show_india_links === true ? buttons(k.india_links) : null
      ]);
    });
    var parts = [pageTop(str(b.heading), h("div", { class: "books" }, cards))];

    var e = obj(b.events);
    var events = list(e.items).filter(function (x) { return x && (str(x.city) || str(x.venue)); });
    if (on(e) && events.length) {
      parts.push(block("events", str(e.heading), h("ul", { class: "list-items" }, events.map(function (x) {
        return h("li", null, [
          str(x.date) ? h("p", { class: "item-meta" }, str(x.date)) : null,
          h("p", null, [str(x.city), str(x.city) && str(x.venue) ? ", " : null, str(x.venue)]),
          str(x.url) ? h("p", null, link(x.url, str(x.link_label) || "Details", "tap-link")) : null
        ]);
      }))));
    }

    var p = obj(b.panels);
    var panels = list(p.items).filter(function (x) { return x && str(x.title); });
    if (on(p) && panels.length) {
      parts.push(block("panels", str(p.heading), h("ul", { class: "list-items" }, panels.map(function (x) {
        var meta = [str(x.date), str(x.place)].filter(Boolean).join(" · ");
        return h("li", null, [
          meta ? h("p", { class: "item-meta" }, meta) : null,
          h("p", null, str(x.url) ? link(x.url, str(x.title), "tap-link") : str(x.title)),
          str(x.with) ? h("p", null, "With " + str(x.with)) : null
        ]);
      }))));
    }

    var q = obj(b.press);
    var quotes = list(q.items).filter(function (x) { return x && str(x.quote); });
    if (on(q) && quotes.length) {
      parts.push(block("press", str(q.heading), h("ul", { class: "list-items" }, quotes.map(function (x) {
        var src = str(x.source);
        return h("li", null, h("figure", null, [
          h("blockquote", { class: "press-quote" }, h("p", null, str(x.quote))),
          src ? h("figcaption", { class: "caption press-source" }, str(x.url) ? link(x.url, src, "tap-link") : src) : null
        ]));
      }))));
    }
    return parts;
  }

  /* ---------- Contact ---------- */

  function field(id, label, control) {
    return h("div", { class: "field" }, [h("label", { for: id }, label), control]);
  }

  function contactForm(key, email) {
    var status = h("p", { class: "form-status", role: "status", "aria-live": "polite" });
    var send = h("button", { type: "submit", class: "button" }, "Send message");
    var form = h("form", { class: "contact-form" }, [
      field("cf-name", "Name", h("input", { id: "cf-name", name: "name", type: "text", autocomplete: "name", required: true })),
      field("cf-email", "Email", h("input", { id: "cf-email", name: "email", type: "email", autocomplete: "email", required: true })),
      field("cf-message", "Message", h("textarea", { id: "cf-message", name: "message", rows: "6", required: true })),
      // honeypot: people never see or fill this; spam bots do
      h("div", { class: "honeypot", "aria-hidden": "true" }, [
        h("label", { for: "cf-botcheck" }, "Leave this empty"),
        h("input", { id: "cf-botcheck", name: "botcheck", type: "checkbox", tabindex: "-1", autocomplete: "off" })
      ]),
      h("div", null, send),
      status
    ]);
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var fd = new FormData(form);
      if (fd.get("botcheck")) return;
      send.disabled = true;
      status.textContent = "Sending…";
      fetch(FORM_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          access_key: key,
          subject: "New message from krinapatel.art",
          from_name: "krinapatel.art",
          name: fd.get("name"),
          email: fd.get("email"),
          message: fd.get("message")
        })
      })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return r.ok && j.success; }); })
        .then(function (ok) {
          if (!ok) throw new Error("not sent");
          form.reset();
          status.textContent = "Thank you, your message was sent.";
        })
        .catch(function () {
          status.textContent = "";
          add(status, ["Your message could not be sent. Please email ", h("a", { href: "mailto:" + email }, email), " instead."]);
        })
        .then(function () { send.disabled = false; });
    });
    return form;
  }

  function contact(c, d) {
    var email = str(d.site.email);
    var kids = [];
    var t = obj(c.talks);
    if (on(t) && str(t.text)) kids.push(h("p", { class: "contact-lead" }, str(t.text)));
    if (str(c.form_key)) kids.push(contactForm(c.form_key, email));
    else if (email) kids.push(h("p", null, ["Email: ", h("a", { href: "mailto:" + email }, email)]));
    kids.push(socialLinks(d.site, "social link-row"));
    var n = obj(c.newsletter);
    if (on(n) && str(n.url)) {
      kids.push(h("div", { class: "newsletter" }, [
        str(n.text) ? h("p", null, str(n.text)) : null,
        h("div", { class: "button-row" }, h("a", { class: "button", href: href(n.url) }, str(n.label) || "Sign up for the newsletter"))
      ]));
    }
    return [pageTop(str(c.heading), kids)];
  }

  /* ---------- full-screen viewer (Studio) ---------- */

  function svg(path) {
    var ns = "http://www.w3.org/2000/svg";
    var s = document.createElementNS(ns, "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("fill", "none");
    s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", "1.6");
    s.setAttribute("stroke-linecap", "round");
    s.setAttribute("stroke-linejoin", "round");
    s.setAttribute("aria-hidden", "true");
    var p = document.createElementNS(ns, "path");
    p.setAttribute("d", path);
    s.appendChild(p);
    return s;
  }

  function makeViewer() {
    var items = [], index = 0, opener = null;
    var img = h("img", { alt: "" });
    var caption = h("p", { class: "caption" });
    var close = h("button", { type: "button", class: "icon-button", "aria-label": "Close" }, svg("M6 6l12 12M18 6L6 18"));
    var prev = h("button", { type: "button", class: "icon-button", "aria-label": "Previous artwork" }, svg("M15 5l-7 7 7 7"));
    var next = h("button", { type: "button", class: "icon-button", "aria-label": "Next artwork" }, svg("M9 5l7 7-7 7"));
    var stage = h("div", { class: "viewer-stage" }, img);
    var dlg = h("dialog", { class: "viewer", "aria-label": "Artwork" }, [
      h("div", { class: "viewer-top" }, close),
      stage,
      h("div", { class: "viewer-bottom" }, [prev, caption, next])
    ]);
    var usable = typeof dlg.showModal === "function";

    function show(i) {
      index = (i + items.length) % items.length;
      var a = items[index];
      img.removeAttribute("src");
      img.setAttribute("alt", str(a.alt));
      img.setAttribute("src", asset(a.image) || asset(a.image_small));
      caption.textContent = "";
      add(caption, artCaption(a));
      prev.hidden = next.hidden = items.length < 2;
    }

    close.addEventListener("click", function () { if (dlg.open) dlg.close(); });
    prev.addEventListener("click", function () { show(index - 1); });
    next.addEventListener("click", function () { show(index + 1); });
    dlg.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { e.preventDefault(); show(index - 1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); show(index + 1); }
    });
    dlg.addEventListener("close", function () {
      root.classList.remove("viewer-open");
      if (opener) opener.focus();
    });
    var x0 = null, y0 = null;
    stage.addEventListener("touchstart", function (e) {
      if (e.touches.length !== 1) { x0 = null; return; }
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    }, { passive: true });
    stage.addEventListener("touchend", function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) show(index + (dx < 0 ? 1 : -1));
    });

    return {
      node: dlg,
      setItems: function (l) { items = l; },
      open: function (i, from) {
        if (!usable || !items.length) return;
        opener = from;
        show(i);
        root.classList.add("viewer-open");
        dlg.showModal();
        close.focus();
      }
    };
  }

  /* ---------- sticky header ---------- */

  // On narrow screens the menu wraps under the name. Let the name scroll away
  // and keep only the menu row stuck to the top.
  function stickyHeader(hd) {
    var nameEl = hd.querySelector(".site-name"), nav = hd.querySelector(".site-nav");
    function measure() {
      var off = 0;
      if (nav && nameEl && nav.offsetTop > nameEl.offsetTop + 8) off = Math.max(0, nav.offsetTop - 4);
      hd.style.setProperty("--stick", off + "px");
    }
    function scrolled() { hd.classList.toggle("is-scrolled", window.scrollY > 2); }
    measure();
    scrolled();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", scrolled, { passive: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  }

  /* ---------- build ---------- */

  function build(d) {
    if (!d || typeof d !== "object" || !d.site || !str(d.site.name)) throw new Error("content.json is missing the site name");
    var page = document.body.getAttribute("data-page") || "home";
    var viewer = page === "studio" ? makeViewer() : null;

    var parts;
    if (page === "about") parts = about(obj(d.about));
    else if (page === "studio") parts = studio(obj(d.studio), d, viewer);
    else if (page === "research") parts = research(obj(d.research));
    else if (page === "books") parts = books(obj(d.books));
    else if (page === "contact") parts = contact(obj(d.contact), d);
    else parts = home(d);

    var main = h("main", { id: "main", tabindex: "-1", class: page === "home" ? "page-home" : null }, parts);
    var hd = header(d, page);
    var site = document.getElementById("site");
    site.textContent = "";
    add(site, [
      h("a", { class: "skip", href: "#main" }, "Skip to content"),
      hd,
      main,
      footer(d),
      viewer ? viewer.node : null
    ]);
    site.hidden = false;
    var fallback = document.querySelector(".fallback");
    if (fallback) fallback.hidden = true;
    window.siteReady = true;
    root.classList.add("js");
    stickyHeader(hd);

    // content arrives after the page loads, so follow a #link by hand
    if (location.hash.length > 1) {
      var target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target) target.scrollIntoView();
    }
  }

  function fail(err) {
    if (window.console) console.error("Could not build the page from content.json:", err);
    root.classList.remove("js");   // shows the short fallback written into the page file
  }

  fetch("content.json", { cache: "no-cache" })
    .then(function (r) {
      if (!r.ok) throw new Error("content.json: HTTP " + r.status);
      return r.json();
    })
    .then(build)
    .catch(fail);
})();
