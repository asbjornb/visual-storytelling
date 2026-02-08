import * as ch1 from "./chapters/ch1-balance.js";
import * as ch2 from "./chapters/ch2-merit.js";
import * as ch3 from "./chapters/ch3-grid.js";
import * as ch4 from "./chapters/ch4-traders.js";
import * as ch5 from "./chapters/ch5-green.js";

import heroHtml from "./slides/hero.html?raw";
import ch1Html from "./slides/ch1-balance.html?raw";
import ch2Html from "./slides/ch2-merit.html?raw";
import ch3Html from "./slides/ch3-grid.html?raw";
import ch4Html from "./slides/ch4-traders.html?raw";
import ch5Html from "./slides/ch5-green.html?raw";
import conclusionHtml from "./slides/conclusion.html?raw";

/* ── Slide definitions ─────────────────────────────── */

const SLIDES = [
  { id: "hero",       html: heroHtml,       chapter: null },
  { id: "ch-balance", html: ch1Html,        chapter: ch1 },
  { id: "ch-merit",   html: ch2Html,        chapter: ch2 },
  { id: "ch-grid",    html: ch3Html,        chapter: ch3 },
  { id: "ch-traders", html: ch4Html,        chapter: ch4 },
  { id: "ch-green",   html: ch5Html,        chapter: ch5 },
  { id: "conclusion", html: conclusionHtml, chapter: null },
];

/* ── State ─────────────────────────────────────────── */

let currentPage = 0;
let totalPages = SLIDES.length;
let pageElements = [];
let initialized = new Set();      // track which chapters have been init'd
let touchStartX = 0;
let touchStartY = 0;

/* ── Boot ──────────────────────────────────────────── */

function boot() {
  const pagesContainer = document.getElementById("pages");

  // Inject slide HTML into pages container
  SLIDES.forEach((slide, i) => {
    const html = slide.html;
    const wrapper = document.createElement("div");
    wrapper.className = "page-wrapper";
    wrapper.dataset.page = i;
    if (i === 0) wrapper.classList.add("is-active");
    wrapper.innerHTML = html;
    pagesContainer.appendChild(wrapper);
  });

  pageElements = Array.from(pagesContainer.querySelectorAll(".page-wrapper"));

  // Build navigation
  buildTimeline();
  setupEdgeNav();
  setupKeyboard();
  setupSwipe();

  // Initialize first slide's chapter
  goToPage(0);
}

/* ── Page navigation ───────────────────────────────── */

function goToPage(newPage) {
  newPage = Math.max(0, Math.min(newPage, totalPages - 1));

  // Destroy previous chapter's animation loops if navigating away
  const prevSlide = SLIDES[currentPage];
  if (prevSlide.chapter && prevSlide.chapter.destroy) {
    prevSlide.chapter.destroy();
  }

  // Toggle active class
  pageElements.forEach((el, i) => {
    el.classList.toggle("is-active", i === newPage);
  });

  currentPage = newPage;

  // Initialize this chapter if not yet done
  const slide = SLIDES[newPage];
  if (slide.chapter && !initialized.has(newPage)) {
    slide.chapter.init();
    initialized.add(newPage);
  }

  updateTimeline();
  updateEdgeNav();
}

function nextPage() {
  if (currentPage < totalPages - 1) {
    goToPage(currentPage + 1);
  }
}

function prevPage() {
  if (currentPage > 0) {
    goToPage(currentPage - 1);
  }
}

/* ── Edge navigation arrows ────────────────────────── */

function setupEdgeNav() {
  const prevBtn = document.getElementById("edge-prev");
  const nextBtn = document.getElementById("edge-next");

  prevBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    prevPage();
  });

  nextBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    nextPage();
  });

  updateEdgeNav();
}

function updateEdgeNav() {
  const prevBtn = document.getElementById("edge-prev");
  const nextBtn = document.getElementById("edge-next");

  prevBtn.classList.toggle("is-hidden", currentPage <= 0);
  nextBtn.classList.toggle("is-hidden", currentPage >= totalPages - 1);
}

/* ── Timeline navigation ──────────────────────────── */

function buildTimeline() {
  const timeline = document.getElementById("timeline");
  timeline.innerHTML = "";

  SLIDES.forEach((slide, i) => {
    const bar = document.createElement("button");
    bar.className = "timeline-bar";
    bar.dataset.page = i;

    if (i === 0 || i === totalPages - 1) {
      bar.classList.add("timeline-bar--bookend");
    }

    bar.addEventListener("click", () => goToPage(i));
    timeline.appendChild(bar);
  });

  updateTimeline();
}

function updateTimeline() {
  const bars = document.querySelectorAll(".timeline-bar");
  bars.forEach((bar) => {
    const pageIdx = parseInt(bar.dataset.page);
    bar.classList.toggle("is-active", pageIdx === currentPage);
  });
}

/* ── Swipe navigation ─────────────────────────────── */

function setupSwipe() {
  const viewer = document.getElementById("viewer");

  viewer.addEventListener("touchstart", (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  viewer.addEventListener("touchend", (e) => {
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;

    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (deltaX < 0) {
        nextPage();
      } else {
        prevPage();
      }
    }
  }, { passive: true });
}

/* ── Keyboard navigation ──────────────────────────── */

function setupKeyboard() {
  document.addEventListener("keydown", (e) => {
    // Don't capture keyboard when interacting with sliders/inputs
    if (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON") return;

    if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") {
      e.preventDefault();
      nextPage();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      prevPage();
    }
  });
}

boot();
