async function check() {
  const res = await fetch('https://tiles.openfreemap.org/styles/liberty');
  const style = await res.json();
  console.log(style.layers.map(l => l.id).join(', '));
}
check();
