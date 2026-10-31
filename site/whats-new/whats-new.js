// All, New or Fixes: shows only the entries with that tag. Without this script every entry simply stays on the page.
const bar = document.querySelector('.logfilter');
const entries = [...document.querySelectorAll('.changelog .entry')];
const count = document.getElementById('logcount');
bar.hidden = false;
bar.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  const show = b.dataset.show;
  bar.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
  entries.forEach(a => { a.hidden = show !== 'all' && !a.querySelector('.tag.' + show); });
  count.textContent = `Showing ${entries.filter(a => !a.hidden).length} of ${entries.length} entries`;
});
