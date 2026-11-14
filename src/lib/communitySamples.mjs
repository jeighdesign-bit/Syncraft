// Fictional wordmarks for the local development preview only. Never submitted
// to the community table or presented as approved businesses.
const examples = [
  ['NORTHLINE', 'Arial, sans-serif', '700', '<path d="M5 40 18 18l13 22H5Zm13-14-8 14h16Z"/>'],
  ['pressroom', 'Georgia, serif', '700', '<rect x="5" y="23" width="24" height="5"/><rect x="5" y="32" width="24" height="5"/>'],
  ['ink & thread', 'Georgia, serif', '400', '<path d="m17 17 13 13-13 13L4 30Zm0 7-6 6 6 6 6-6Z"/>'],
  ['WEARLAB', 'Arial, sans-serif', '800', '<path d="m4 22 6-5h5l2 5 2-5h5l6 5-5 8-2-2v16H11V28l-2 2Z"/>'],
  ['stitch co.', 'Arial, sans-serif', '600', '<circle cx="17" cy="31" r="13" fill="none" stroke="#ddd" stroke-width="3"/><path d="m10 31 5 5 9-11" fill="none" stroke="#ddd" stroke-width="3"/>'],
  ['PRINTFORM', 'Arial, sans-serif', '700', '<path d="M4 20h26v9H15v14H4Z"/><path d="M19 33h11v10H19Z"/>'],
];

export const COMMUNITY_SAMPLE_LOGOS = examples.map(([name, font, weight, mark], index) => ({
  id: `sample-${index}`,
  business_name: name,
  website: null,
  logo_url: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="210" height="64" viewBox="0 0 210 64"><g fill="#ddd">${mark}<text x="39" y="38" font-family="${font}" font-weight="${weight}" font-size="${name.length > 10 ? 22 : 25}" letter-spacing="${name === name.toUpperCase() ? '-1' : '-.6'}">${name.replaceAll('&', '&amp;')}</text></g></svg>`)}`,
}));

export function showCommunitySamples({ development, loaded, count }) {
  return development === true && loaded === true && count === 0;
}
