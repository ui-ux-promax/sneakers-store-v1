const manrope =
  'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap';
const unbounded =
  'https://fonts.googleapis.com/css2?family=Unbounded:wght@600;700&display=swap';
const anybody =
  'https://fonts.googleapis.com/css2?family=Anybody:wght@600;700;800&display=swap';

function fontFace(family, weight) {
  return `@font-face {
  font-family: '${family}';
  font-style: normal;
  font-weight: ${weight};
  font-display: swap;
  src: local("Arial");
}`;
}

module.exports = {
  [manrope]: [400, 500, 600, 700].map((weight) => fontFace('Manrope', weight)).join('\n'),
  [unbounded]: [600, 700].map((weight) => fontFace('Unbounded', weight)).join('\n'),
  [anybody]: [600, 700, 800].map((weight) => fontFace('Anybody', weight)).join('\n'),
};
