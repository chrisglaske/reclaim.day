import './style.css';

const root = document.documentElement;

// The look picker swaps the screenshots in the "Pick your colors" section.
const picks = document.querySelectorAll('[data-look]');
picks.forEach(b => b.addEventListener('click', () => {
  picks.forEach(s => s.setAttribute('aria-pressed', String(s === b)));
  document.querySelectorAll('img[data-shot]').forEach(img => {
    img.srcset = img.srcset.replace(/\/shots\/[\w-]+\//g, `/shots/${b.dataset.look}/`);
    img.src = `/shots/${b.dataset.look}/${img.dataset.shot}.webp`;
    img.alt = img.alt.replace(/in the .+ look/, `in the ${b.textContent.trim()} look`);
  });
}));

// Phones and the desktop window settle into place as they scroll into view. Without JS they just show.
root.classList.add('js');
const io = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}), { rootMargin: '0px 0px -10% 0px' });
document.querySelectorAll('.pop').forEach(el => io.observe(el));

// Little emoji bursts
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
function burst(el, list) {
  if (calm) return;
  const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  for (let i = 0; i < 7; i++) {
    const b = document.createElement('span');
    b.className = 'burst'; b.textContent = list[i % list.length];
    b.style.left = cx - 13 + 'px'; b.style.top = cy - 13 + 'px';
    const a = Math.PI * 2 * i / 7 - Math.PI / 2 + (Math.random() - .5) * .6, d = 50 + Math.random() * 50;
    b.style.setProperty('--x', Math.cos(a) * d + 'px');
    b.style.setProperty('--y', Math.sin(a) * d - 20 + 'px');
    b.style.setProperty('--rot', (Math.random() * 60 - 30) + 'deg');
    document.body.appendChild(b); setTimeout(() => b.remove(), 1000);
  }
}

// How's today going? (just for fun)
const replies = ['That sounds hard. Ride out a wave if you want company. 🤍', 'Fair enough. Small steps still count. 🌱', 'Okay is okay. ☁️', 'Nice. Worth a line in your journal? 📓', 'Lovely. Enjoy it. ☀️'];
document.querySelectorAll('.mood button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.mood button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  document.getElementById('moodmsg').textContent = replies[b.dataset.m];
  burst(b, [b.textContent]);
}));

// The to-do card: tick off doses the way the app does
const todo = document.getElementById('todo');
if (todo) {
  const am = todo.querySelector('[data-id=am]'), pm = todo.querySelector('[data-id=pm]'), ev = todo.querySelector('[data-id=ev]');
  const chk = pm.querySelector('.check'), dopt = pm.querySelector('.dopt'), opts = pm.querySelector('.opts');
  const tt = dopt.querySelector('.tt'), td = dopt.querySelector('.td'), msg = document.getElementById('medmsg'), evb = document.getElementById('evbtn');
  const orig = { tt: tt.innerHTML, td: td.innerHTML };
  const now = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  let last = 'todo';
  const closeOpts = () => { opts.hidden = true; dopt.setAttribute('aria-expanded', 'false'); };
  function tally(st) {
    if (st) last = st;
    const n = [am, pm, ev].filter(t => t.classList.contains('done')).length;
    msg.textContent = last === 'skip' && n < 3 ? `Skipped, and that’s okay. ${n} of 3 done. 🌙`
      : n === 3 ? '3 of 3 done. All caught up. 🎉' : `${n} of 3 done. Tap a circle, or a name for more. 👆`;
  }
  function set(state, text) {
    pm.classList.toggle('done', state === 'done'); pm.classList.toggle('skip', state === 'skip');
    chk.classList.toggle('on', state === 'done');
    if (state === 'todo') { tt.innerHTML = orig.tt; td.innerHTML = orig.td; } else { tt.textContent = 'Afternoon dose'; td.textContent = text; }
    chk.setAttribute('aria-label', state === 'todo' ? 'Mark afternoon dose taken' : 'Undo afternoon dose');
    closeOpts(); tally(state);
  }
  chk.onclick = () => {
    if (pm.classList.contains('done') || pm.classList.contains('skip')) set('todo');
    else { set('done', 'Taken at ' + now()); burst(chk, ['💚', '🎉', '✨', '💊']); }
  };
  dopt.onclick = () => { const open = opts.hidden; opts.hidden = !open; dopt.setAttribute('aria-expanded', String(open)); };
  opts.querySelectorAll('button').forEach(b => b.onclick = () => {
    const o = b.dataset.o;
    if (o === 'now') { set('done', 'Taken at ' + now()); burst(chk, ['💚', '🎉', '✨', '💊']); }
    if (o === 'earlier') { set('done', 'Taken earlier today'); burst(chk, ['🕐', '💚', '✨']); }
    if (o === 'skip') set('skip', 'Skipped today');
  });
  evb.onclick = () => {
    const d = !ev.classList.contains('done');
    ev.classList.toggle('done', d); ev.querySelector('.td').textContent = d ? 'Noted at ' + now() : 'Next, 6:00 PM';
    evb.textContent = d ? 'Review' : 'Check in'; if (d) burst(evb, ['🌙', '💜', '✨']); tally();
  };
  am.querySelector('.check').onclick = e => {
    const d = am.classList.toggle('done'); e.currentTarget.classList.toggle('on', d);
    am.querySelector('.td').textContent = d ? 'Taken at 8:12 AM' : 'Due 8:00 AM'; tally();
  };
}

// The starburst and the floating emoji round the hero (which burst when tapped) each sit in free space as
// near their data-at spot (a fraction of the hero's size) as they can, clear of text, phones, buttons, the cue,
// the side arrows, the ticker and each other, with room for the bob, wobble and hover; with no room near
// the spot they stay hidden.
const emo = [...document.querySelectorAll('.emo span')], star = document.querySelector('.emo .star');
emo.forEach((el, i) => {
  el.style.setProperty('--d', (0.2 + i * 0.1).toFixed(2) + 's');
  el.addEventListener('click', () => burst(el, [el.textContent, '✨', '💚']));
});
const hero = document.querySelector('.hero');
// Boxes in page coordinates as at the top of the page; fixed things stay where they are on screen.
const page = (r, fixed) => ({ l: r.left + (fixed ? 0 : scrollX), t: r.top + (fixed ? 0 : scrollY), r: r.right + (fixed ? 0 : scrollX), b: r.bottom + (fixed ? 0 : scrollY) });
const box = el => page(el.getBoundingClientRect(), getComputedStyle(el).position === 'fixed');
const lines = el => { const g = document.createRange(); g.selectNodeContents(el); return [...g.getClientRects()].map(r => page(r)); };
const pad = (r, p) => ({ l: r.l - p, t: r.t - p, r: r.r + p, b: r.b + p });
const hit = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
// What's in the hero: headline, text, tags, button and the phones (from their layout and
// rotation, so the landing animation doesn't matter).
function heroBoxes() {
  const out = [];
  document.querySelectorAll('.pills li, .copy .btn, .sheet span').forEach(el => { if (el.offsetWidth) out.push(pad(box(el), 10)); });
  document.querySelectorAll('.hero h1, .lede, .free').forEach(el => lines(el).forEach(r => out.push(pad(r, 6))));
  const trio = document.querySelector('.trio'), tb = page(trio.getBoundingClientRect());
  trio.querySelectorAll('.phone').forEach(p => {
    const a = Math.abs(parseFloat(getComputedStyle(p).getPropertyValue('--r')) || 0) * Math.PI / 180;
    const w = p.offsetWidth, h = p.offsetHeight, cx = tb.l + p.offsetLeft + w / 2, cy = tb.t + p.offsetTop + h / 2;
    const bw = (w * Math.cos(a) + h * Math.sin(a)) / 2, bh = (w * Math.sin(a) + h * Math.cos(a)) / 2;
    out.push(pad({ l: cx - bw, t: cy - bh, r: cx + bw, b: cy + bh }, 12));
  });
  return out;
}
function placeEmoji() {
  if (!hero) return;
  [star, ...emo].forEach(el => el?.classList.remove('on'));
  const keep = heroBoxes();
  document.querySelectorAll('.top .logo, .top nav a, .cue').forEach(el => { if (el.offsetWidth) keep.push(pad(box(el), 10)); });
  // The arrows are fixed at the foot of the screen, so the page scrolls under everything below their top edge.
  document.querySelectorAll('.nav').forEach(n => { const r = n.getBoundingClientRect(); if (r.width) keep.push({ l: r.left - 10, t: r.top + scrollY - 10, r: r.right + 10, b: 1e5 }); });
  const maxR = document.documentElement.clientWidth - 8, hb = page(hero.getBoundingClientRect());
  // Inside the hero, and above the fold so none is cut off at the bottom edge.
  const maxB = Math.min(hb.b, innerHeight) - 10;
  // The starburst first (it turns and grows a little as it wobbles), then the emoji (hidden on phones).
  for (const el of [star, ...emo]) {
    if (!el?.offsetWidth) continue;
    const w = el.offsetWidth, h = el.offsetHeight, m = el === star ? [14, 14] : [6, 18]; // sides, top: the emoji bob 14px up
    let best = null;
    // data-at can list fallback spots after a semicolon.
    for (const spot of el.dataset.at.split(';')) {
      const [fx, fy] = spot.split(',').map(Number);
      const px = hb.l + fx * (hb.r - hb.l) - w / 2, py = hb.t + fy * (hb.b - hb.t) - h / 2;
      let bestD = 260 * 260;
      for (let x = Math.max(8, px - 260); x <= Math.min(maxR - w, px + 260); x += 6) {
        for (let y = Math.max(8, py - 260); y <= Math.min(maxB - h, py + 260); y += 6) {
          const d = (x - px) ** 2 + (y - py) ** 2;
          if (d >= bestD) continue;
          const me = { l: x - m[0], t: y - m[1], r: x + w + m[0], b: y + h + m[0] };
          if (!keep.some(k => hit(me, k))) { best = [x, y]; bestD = d; }
        }
      }
      if (best) break;
    }
    if (!best) continue;
    el.style.left = best[0] - hb.l + 'px'; el.style.top = best[1] - hb.t + 'px';
    el.classList.add('on');
    keep.push({ l: best[0] - m[0] - 2, t: best[1] - m[1], r: best[0] + w + m[0] + 2, b: best[1] + h + m[0] + 2 });
  }
}
let placing = 0;
const placeSoon = () => { cancelAnimationFrame(placing); placing = requestAnimationFrame(placeEmoji); };

document.querySelectorAll('.sheet span').forEach(el => el.addEventListener('click', () => burst(el, [el.textContent, '✨', '💚'])));

// The "See what's inside" cue fades once someone has scrolled
const onScroll = () => root.classList.toggle('scrolled', scrollY > 60);
addEventListener('scroll', onScroll, { passive: true }); onScroll();
// The cue sits at the foot of the first screen; where it would cover something in the hero it stays hidden.
const cue = document.querySelector('.cue');
const placeCue = () => {
  root.classList.remove('cue-off');
  const c = pad(box(cue), 8);
  root.classList.toggle('cue-off', heroBoxes().some(b => hit(c, b)));
};
if (cue && hero) { addEventListener('resize', placeCue, { passive: true }); placeCue(); document.fonts?.ready.then(placeCue); }

// On desktop the closing band and the footer share one screen: the band takes whatever height the footer leaves.
const foot = document.querySelector('footer');
if (foot) {
  const sizeFoot = () => document.documentElement.style.setProperty('--foot', foot.offsetHeight + 'px');
  addEventListener('resize', sizeFoot, { passive: true }); sizeFoot(); document.fonts?.ready.then(sizeFoot);
}

// The arrows step through the sections, and Top jumps back from anywhere. On the last screen only Top is left.
const next = document.getElementById('next');
if (next) {
  const parts = [...document.querySelectorAll('.intro, main > section')]; // the footer shares the last screen with the closing band
  const atEnd = () => innerHeight + scrollY >= document.documentElement.scrollHeight - 4 || !parts.some(p => p.getBoundingClientRect().top > 40);
  const top = document.getElementById('top');
  const sync = () => {
    const up = atEnd();
    if (up && document.activeElement?.closest('#next, #prev')) top.focus();
    document.querySelector('.nav').classList.toggle('last', up);
  };
  const goNext = () => {
    const behavior = calm ? 'auto' : 'smooth';
    if (atEnd()) scrollTo({ top: 0, behavior });
    else (parts.find(p => p.getBoundingClientRect().top > 40) ?? { scrollIntoView: o => scrollTo({ top: document.documentElement.scrollHeight, ...o }) }).scrollIntoView({ behavior });
  };
  const goPrev = () => {
    const behavior = calm ? 'auto' : 'smooth';
    const before = parts.filter(p => p.getBoundingClientRect().top < -40).pop();
    if (before) before.scrollIntoView({ behavior });
    else scrollTo({ top: 0, behavior });
  };
  const prev = document.getElementById('prev');
  next.addEventListener('click', goNext);
  top.addEventListener('click', () => {
    scrollTo({ top: 0, behavior: calm ? 'auto' : 'smooth' });
    document.querySelector('.logo').focus({ preventScroll: true }); // Top is about to hide
  });
  prev.addEventListener('click', goPrev);
  // Down and Up do the same as the arrows. Fields and the look picker keep their own arrow keys, and a held key
  // does not repeat, so one press moves one section.
  addEventListener('keydown', e => {
    if ((e.key !== 'ArrowDown' && e.key !== 'ArrowUp') || e.defaultPrevented || e.repeat || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.target.closest?.('input, select, textarea, [contenteditable], [role="radiogroup"], [role="tablist"]')) return;
    e.preventDefault();
    (e.key === 'ArrowDown' ? goNext : goPrev)();
  });
  // The wheel pages the same way (swiping is CSS scroll snapping, see style.css), but only from a section's edge: inside one taller than the window they
  // scroll normally until its bottom (down) or top (up) is on screen, so nothing is cut off.
  const here = () => parts.filter(p => p.getBoundingClientRect().top <= 1).pop();
  const canPage = dir => {
    if (dir > 0) return !atEnd() && here()?.getBoundingClientRect().bottom <= innerHeight + 2;
    return scrollY > 0 && (here()?.getBoundingClientRect().top ?? 0) >= -40;
  };
  let busy = false, idle;
  const page = dir => {
    busy = true;
    (dir > 0 ? goNext : goPrev)();
    clearTimeout(idle);
    idle = setTimeout(() => { busy = false; }, calm ? 250 : 800);
  };
  // A trackpad keeps sending wheel events after the finger lifts; stay locked until they stop.
  addEventListener('wheel', e => {
    if (e.ctrlKey || e.defaultPrevented || Math.abs(e.deltaY) < 4 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    if (e.target.closest?.('input, select, textarea, [contenteditable]')) return;
    const dir = e.deltaY > 0 ? 1 : -1;
    if (busy) { e.preventDefault(); clearTimeout(idle); idle = setTimeout(() => { busy = false; }, 160); return; }
    if (!canPage(dir)) return;
    e.preventDefault();
    page(dir);
  }, { passive: false });
  const nav = document.querySelector('.nav');
  const showPrev = () => { const atTop = scrollY < 60; prev.hidden = top.hidden = atTop; nav.classList.toggle('off', atTop); };
  addEventListener('scroll', showPrev, { passive: true });
  showPrev();
  addEventListener('scroll', sync, { passive: true });
  sync();
}

// Emoji last, once the cue has its place.
placeEmoji(); document.fonts?.ready.then(placeSoon); addEventListener('resize', placeSoon, { passive: true });
