// A link to /faq/#<id> opens that answer and scrolls to it.
const openFromHash = () => {
  const d = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (d && d.tagName === 'DETAILS') { d.open = true; d.scrollIntoView({ block: 'start' }); }
};
openFromHash();
addEventListener('hashchange', openFromHash);
