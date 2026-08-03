(() => {
  "use strict";

  const ADS_ENABLED = false; // 애드센스 승인 후 true로 전환하고 index.html의 adsbygoogle 스크립트 태그도 다시 켤 것
  const AD_CLIENT = "ca-pub-XXXXXXXXXXXXXXXX";
  const AD_SLOT_LOADING = "XXXXXXXXXX"; // 결과 도출 중(로딩) 화면의 큰 광고(300x250)
  const AD_SLOT_BANNER = "YYYYYYYYYY"; // 상/하단 공통 얇은 배너(320x50)
  const AD_CHECK_INTERVAL_MS = 250;
  const AD_CHECK_MAX_TRIES = 12;
  const LOADING_DURATION_MS = 2600;

  const DEFAULT_QUOTES = [
    "손금은 미래를 정하지 않지만, 나를 이해하는 힌트를 줍니다.",
    "오늘의 선택이 내일의 손금을 그려갑니다.",
    "가장 좋은 손금은 지금 이 순간을 사는 마음가짐입니다."
  ];
  const DEFAULT_OUTRO = [
    "당신의 손금은 오늘도 조금씩 자라고 있어요.",
    "결과는 참고일 뿐, 진짜 이야기는 당신이 씁니다."
  ];

  const state = {
    data: null,
    hand: null,
    lineIndex: 0,
    answers: [], // { lineName, label, desc, score }
    resultCode: null,
    friendCode: null
  };

  const $ = (id) => document.getElementById(id);

  const screens = {
    hand: $("screen-hand"),
    line: $("screen-line"),
    prep: $("screen-prep"),
    loading: $("screen-loading"),
    result: $("screen-result")
  };

  function showScreen(name) {
    Object.values(screens).forEach((el) => el.classList.remove("active"));
    screens[name].classList.add("active");
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }

  function pickRandom(arr, fallback) {
    const list = Array.isArray(arr) && arr.length ? arr : fallback;
    return list[Math.floor(Math.random() * list.length)];
  }

  // ---------- Ad slots ----------
  // size: "large" -> 300x250 (결과 도출 중 화면), "thin" -> 320x50 (상/하단 공통 배너)
  const AD_SIZES = {
    large: { width: 300, height: 250 },
    thin: { width: 320, height: 50 }
  };

  function buildAdSlot(container, slotId, { withFallback = true, size = "large" } = {}) {
    container.innerHTML = "";
    container.classList.remove("ad-filled", "ad-empty");

    if (withFallback) {
      const fallbackEl = document.createElement("div");
      fallbackEl.className = "quote-fallback";
      const label = document.createElement("div");
      label.className = "quote-label";
      label.textContent = "TODAY'S PALM QUOTE";
      const text = document.createElement("div");
      text.className = "quote-text";
      text.textContent = pickRandom(state.data && state.data.intro, DEFAULT_QUOTES);
      fallbackEl.appendChild(label);
      fallbackEl.appendChild(text);
      container.appendChild(fallbackEl);
    }

    if (!ADS_ENABLED) {
      container.classList.add("ad-empty");
      return;
    }

    const { width, height } = AD_SIZES[size];
    const ins = document.createElement("ins");
    ins.className = "adsbygoogle";
    ins.style.display = "inline-block";
    ins.style.width = `${width}px`;
    ins.style.height = `${height}px`;
    ins.setAttribute("data-ad-client", AD_CLIENT);
    ins.setAttribute("data-ad-slot", slotId);
    container.appendChild(ins);

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      /* adsbygoogle not loaded (e.g. offline dev) */
    }

    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      const filled = !!ins.querySelector("iframe");
      if (filled) {
        container.classList.add("ad-filled");
        clearInterval(timer);
      } else if (tries >= AD_CHECK_MAX_TRIES) {
        container.classList.add("ad-empty");
        clearInterval(timer);
      }
    }, AD_CHECK_INTERVAL_MS);
  }

  function initBannerAd(elementId) {
    const wrap = $(elementId);

    if (!ADS_ENABLED) {
      wrap.classList.add("ad-empty");
      return;
    }

    const ins = wrap.querySelector(".adsbygoogle");
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      /* noop */
    }
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      const filled = !!ins.querySelector("iframe");
      if (filled) {
        clearInterval(timer);
      } else if (tries >= AD_CHECK_MAX_TRIES) {
        wrap.classList.add("ad-empty");
        clearInterval(timer);
      }
    }, AD_CHECK_INTERVAL_MS);
  }

  function renderPrepQuote() {
    const el = $("prepQuote");
    el.innerHTML = "";
    const label = document.createElement("div");
    label.className = "quote-label";
    label.textContent = "TODAY'S PALM QUOTE";
    const text = document.createElement("div");
    text.className = "quote-text";
    text.textContent = pickRandom(state.data && state.data.intro, DEFAULT_QUOTES);
    el.appendChild(label);
    el.appendChild(text);
  }

  // ---------- Screen 0: hand select ----------
  function initHandScreen() {
    const params = new URLSearchParams(window.location.search);
    const typeParam = params.get("type");
    if (typeParam && state.data && state.data.types && state.data.types[typeParam]) {
      state.friendCode = typeParam;
      const friendType = state.data.types[typeParam];
      const banner = $("friendBanner");
      banner.hidden = false;
      banner.textContent = `💌 친구의 유형은 '${friendType.name}'예요 — 내 유형도 확인하고 궁합 비교해보세요!`;
    }

    document.querySelectorAll(".hand-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".hand-btn").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        state.hand = btn.dataset.hand;
        setTimeout(() => {
          state.lineIndex = 0;
          state.answers = [];
          renderLineScreen();
          showScreen("line");
        }, 300);
      });
    });
  }

  // ---------- Screens 1-5: line select ----------
  function renderLineScreen() {
    const lines = state.data.lines;
    const line = lines[state.lineIndex];

    const dotsEl = $("progressDots");
    dotsEl.innerHTML = "";
    lines.forEach((_, i) => {
      const dot = document.createElement("span");
      dot.className = "dot";
      if (i === state.lineIndex) dot.classList.add("active");
      else if (i < state.lineIndex) dot.classList.add("done");
      dotsEl.appendChild(dot);
    });

    $("lineQuestion").textContent = line.question;

    const badges = ["A", "B", "C", "D"];
    const optionsEl = $("lineOptions");
    optionsEl.innerHTML = "";
    line.options.forEach((opt, i) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "option-card";

      const badge = document.createElement("div");
      badge.className = "option-badge";
      badge.textContent = opt.badge || badges[i];
      card.appendChild(badge);

      const illust = document.createElement("div");
      illust.className = "option-illustration";
      const illustImg = document.createElement("img");
      illustImg.src = `assets/lines/${line.id}_${opt.id}.jpg`;
      illustImg.alt = `${line.name} ${opt.label}`;
      illustImg.style.width = "100%";
      illustImg.style.height = "100%";
      illustImg.style.objectFit = "contain";
      illustImg.style.borderRadius = "12px";
      // 일러스트는 오른손 기준으로 그려져 있어서, 왼손 선택 시 좌우 반전
      if (state.hand === "left") {
        illustImg.style.transform = "scaleX(-1)";
      }
      illust.appendChild(illustImg);
      card.appendChild(illust);

      const label = document.createElement("div");
      label.className = "option-label";
      label.textContent = opt.label;
      card.appendChild(label);

      const desc = document.createElement("div");
      desc.className = "option-desc";
      desc.textContent = opt.desc;
      card.appendChild(desc);

      card.addEventListener("click", () => selectLineOption(line, opt));
      optionsEl.appendChild(card);
    });
  }

  function selectLineOption(line, opt) {
    state.answers[state.lineIndex] = {
      lineName: line.name,
      label: opt.label,
      desc: opt.desc,
      text: opt.text,
      score: opt.score || {}
    };

    if (state.lineIndex < state.data.lines.length - 1) {
      state.lineIndex += 1;
      renderLineScreen();
    } else {
      showScreen("prep");
      renderPrepQuote();
    }
  }

  // ---------- Screen 6: prep ----------
  function initPrepScreen() {
    $("btnShowResult").addEventListener("click", () => {
      showScreen("loading");
      buildAdSlot($("adLoading"), AD_SLOT_LOADING, { withFallback: true, size: "large" });
      setTimeout(() => {
        computeResult();
        renderResultScreen();
        showScreen("result");
      }, LOADING_DURATION_MS);
    });
  }

  // ---------- Type computation ----------
  function computeResult() {
    const totals = { E: 0, R: 0, D: 0 };
    state.answers.forEach((a) => {
      totals.E += a.score.E || 0;
      totals.R += a.score.R || 0;
      totals.D += a.score.D || 0;
    });

    const e = totals.E >= 2 ? "P" : totals.E <= -2 ? "S" : "B";
    const r = totals.R > 0 ? "C" : "F";
    const d = totals.D > 0 ? "D" : "X";

    state.resultCode = `${e}-${r}-${d}`;
  }

  // ---------- Screen 7b: result ----------
  function renderResultScreen() {
    const type = state.data.types[state.resultCode];
    if (!type) {
      $("resultMod").textContent = "";
      $("resultName").textContent = "결과를 찾을 수 없어요";
      $("resultSummary").textContent = "";
      $("resultCompatSentence").textContent = "";
      $("resultLines").innerHTML = "";
      $("compatList").innerHTML = "";
      $("outroText").textContent = "";
      return;
    }

    $("resultMod").textContent = type.mod || "";
    $("resultName").textContent = type.name || "";
    $("resultSummary").textContent = type.summary || "";

    const compatNames = (type.compatibleWith || [])
      .map((code) => (state.data.types[code] ? state.data.types[code].name : code));
    if (compatNames.length) {
      $("resultCompatSentence").textContent =
        `💛 특히 '${compatNames.join("', '")}' 유형과 궁합이 잘 맞아요`;
    } else {
      $("resultCompatSentence").textContent = "";
    }

    const linesEl = $("resultLines");
    linesEl.innerHTML = "";
    state.answers.forEach((a) => {
      const card = document.createElement("div");
      card.className = "line-result-card";
      const name = document.createElement("div");
      name.className = "line-result-name";
      name.textContent = a.lineName;
      const label = document.createElement("div");
      label.className = "line-result-label";
      label.textContent = a.label;
      const shortDesc = document.createElement("div");
      shortDesc.className = "line-result-short-desc";
      shortDesc.textContent = a.desc;
      const text = document.createElement("div");
      text.className = "line-result-desc";
      text.textContent = a.text;
      card.appendChild(name);
      card.appendChild(label);
      card.appendChild(shortDesc);
      card.appendChild(text);
      linesEl.appendChild(card);
    });

    const compatListEl = $("compatList");
    compatListEl.innerHTML = "";
    (type.compatibleWith || []).slice(0, 2).forEach((code) => {
      const t = state.data.types[code];
      const li = document.createElement("li");
      li.textContent = t ? `${t.mod ? t.mod + " " : ""}${t.name}` : code;
      compatListEl.appendChild(li);
    });

    renderFriendCompare();

    $("outroText").textContent = pickRandom(state.data.outro, DEFAULT_OUTRO);
  }

  function renderFriendCompare() {
    const box = $("friendCompareBox");
    if (!state.friendCode) {
      box.hidden = true;
      return;
    }
    const [, myR, myD] = state.resultCode.split("-");
    const [, frR, frD] = state.friendCode.split("-");

    let message;
    if (state.resultCode === state.friendCode) {
      message = "완전히 같은 유형이에요!";
    } else if (myR === frR && myD === frD) {
      message = "궁합 최고";
    } else if (myR === frR || myD === frD) {
      message = "나쁘지 않음";
    } else {
      message = "정반대 스타일";
    }

    box.hidden = false;
    box.textContent = `나 vs 친구: ${message}`;
  }

  // ---------- Screenshot ----------
  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split("");
    let line = "";
    let cursorY = y;
    words.forEach((ch) => {
      const test = line + ch;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, cursorY);
        line = ch;
        cursorY += lineHeight;
      } else {
        line = test;
      }
    });
    if (line) {
      ctx.fillText(line, x, cursorY);
      cursorY += lineHeight;
    }
    return cursorY;
  }

  function drawScreenshot() {
    const type = state.data.types[state.resultCode];
    if (!type) return;

    const width = 1080;
    const padding = 48;
    const contentWidth = width - padding * 2;

    // measure required height with an offscreen pass
    const measureCanvas = document.createElement("canvas");
    const mctx = measureCanvas.getContext("2d");

    let y = padding;
    y += 260; // headline card
    y += 40; // gap

    mctx.font = "600 26px sans-serif";
    y += estimateWrappedHeight(mctx, type.summary || "", contentWidth - 48, 38) + 16;
    const compatNames = (type.compatibleWith || [])
      .map((code) => (state.data.types[code] ? state.data.types[code].name : code));
    const compatSentence = compatNames.length
      ? `💛 특히 '${compatNames.join("', '")}' 유형과 궁합이 잘 맞아요`
      : "";
    if (compatSentence) {
      y += estimateWrappedHeight(mctx, compatSentence, contentWidth - 48, 34) + 16;
    }
    y += 40;

    state.answers.forEach((a) => {
      y += 130;
    });
    y += 40;
    y += 120; // compat box
    y += 80; // footer

    const height = Math.ceil(y + padding);

    const canvas = $("screenshotCanvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    // background
    ctx.fillStyle = "#FAF5ED";
    ctx.fillRect(0, 0, width, height);

    let cursorY = padding;

    // headline card
    const headlineGrad = ctx.createLinearGradient(padding, cursorY, width - padding, cursorY + 260);
    headlineGrad.addColorStop(0, "#4A2C5E");
    headlineGrad.addColorStop(1, "#6B428A");
    ctx.fillStyle = headlineGrad;
    roundRect(ctx, padding, cursorY, contentWidth, 260, 28);
    ctx.fill();

    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "800 20px sans-serif";
    ctx.fillText("YOUR TYPE", width / 2, cursorY + 60);

    ctx.fillStyle = "#C49A4A";
    ctx.font = "700 26px sans-serif";
    ctx.fillText(type.mod || "", width / 2, cursorY + 120);

    ctx.font = "900 48px sans-serif";
    ctx.fillText(type.name || "", width / 2, cursorY + 185);

    ctx.textAlign = "left";
    cursorY += 260 + 40;

    // summary box
    ctx.fillStyle = "#ffffff";
    const summaryBoxHeight =
      estimateWrappedHeight(mctx, type.summary || "", contentWidth - 48, 38) +
      (compatSentence ? estimateWrappedHeight(mctx, compatSentence, contentWidth - 48, 34) + 16 : 0) +
      48;
    roundRect(ctx, padding, cursorY, contentWidth, summaryBoxHeight, 24);
    ctx.fill();

    ctx.fillStyle = "#2B1B3D";
    ctx.font = "600 26px sans-serif";
    let textY = cursorY + 44;
    textY = wrapText(ctx, type.summary || "", padding + 24, textY, contentWidth - 48, 38);

    if (compatSentence) {
      ctx.fillStyle = "#4A2C5E";
      ctx.font = "700 24px sans-serif";
      textY = wrapText(ctx, compatSentence, padding + 24, textY + 8, contentWidth - 48, 34);
    }

    cursorY += summaryBoxHeight + 32;

    // line result cards
    state.answers.forEach((a) => {
      ctx.fillStyle = "#ffffff";
      roundRect(ctx, padding, cursorY, contentWidth, 110, 18);
      ctx.fill();
      ctx.fillStyle = "#C49A4A";
      ctx.fillRect(padding, cursorY, 6, 110);

      ctx.fillStyle = "#6B428A";
      ctx.font = "800 18px sans-serif";
      ctx.fillText(a.lineName, padding + 28, cursorY + 32);

      ctx.fillStyle = "#2B1B3D";
      ctx.font = "700 24px sans-serif";
      ctx.fillText(a.label, padding + 28, cursorY + 64);

      ctx.fillStyle = "#6b5b7a";
      ctx.font = "400 18px sans-serif";
      const shortDesc = a.text && a.text.length > 40 ? a.text.slice(0, 40) + "…" : a.text || "";
      ctx.fillText(shortDesc, padding + 28, cursorY + 92);

      cursorY += 130;
    });

    cursorY += 10;

    // compat box
    const compatBoxHeight = 100;
    ctx.fillStyle = "rgba(196, 154, 74, 0.15)";
    roundRect(ctx, padding, cursorY, contentWidth, compatBoxHeight, 24);
    ctx.fill();
    ctx.fillStyle = "#2B1B3D";
    ctx.font = "800 22px sans-serif";
    ctx.fillText("💛 나랑 궁합 좋은 유형", padding + 24, cursorY + 38);
    ctx.font = "400 20px sans-serif";
    const compatLine = (type.compatibleWith || [])
      .slice(0, 2)
      .map((code) => (state.data.types[code] ? state.data.types[code].name : code))
      .join("  ·  ");
    ctx.fillText(compatLine, padding + 24, cursorY + 74);

    cursorY += compatBoxHeight + 40;

    // footer
    ctx.textAlign = "center";
    ctx.fillStyle = "#6B428A";
    ctx.font = "600 22px sans-serif";
    ctx.fillText("바이브연구소 · 손금 테스트", width / 2, cursorY + 20);

    canvas.toBlob((blob) => {
      const link = document.createElement("a");
      link.download = `바이브연구소_손금결과_${state.resultCode}.png`;
      link.href = URL.createObjectURL(blob);
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 5000);
    });
  }

  function estimateWrappedHeight(ctx, text, maxWidth, lineHeight) {
    const words = text.split("");
    let line = "";
    let lines = 1;
    words.forEach((ch) => {
      const test = line + ch;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines += 1;
        line = ch;
      } else {
        line = test;
      }
    });
    return lines * lineHeight;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------- Share ----------
  function shareResult() {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("type", state.resultCode);
    const shareUrl = url.toString();
    const type = state.data.types[state.resultCode];
    const shareText = type ? `나의 손금 유형은 '${type.name}'! 너도 확인해봐` : "손금 테스트 해보기";

    if (navigator.share) {
      navigator.share({ title: "바이브연구소 손금 테스트", text: shareText, url: shareUrl }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard
        .writeText(shareUrl)
        .then(() => alert("링크가 복사되었습니다!"))
        .catch(() => alert(shareUrl));
    } else {
      alert(shareUrl);
    }
  }

  // ---------- Restart ----------
  function restart() {
    state.hand = null;
    state.lineIndex = 0;
    state.answers = [];
    state.resultCode = null;
    document.querySelectorAll(".hand-btn").forEach((b) => b.classList.remove("selected"));
    showScreen("hand");
  }

  // ---------- Init ----------
  function initResultActions() {
    $("btnScreenshot").addEventListener("click", drawScreenshot);
    $("btnShare").addEventListener("click", shareResult);
    $("restartLink").addEventListener("click", (e) => {
      e.preventDefault();
      restart();
    });
  }

  function init() {
    fetch("data/results.json")
      .then((res) => {
        if (!res.ok) throw new Error("failed to load results.json");
        return res.json();
      })
      .then((data) => {
        state.data = data;
        initHandScreen();
      })
      .catch((err) => {
        console.error("results.json을 불러오지 못했습니다.", err);
      });

    initPrepScreen();
    initResultActions();
    initBannerAd("topBannerAd");
    initBannerAd("bottomBannerAd");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
