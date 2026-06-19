const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
  "'unsafe-eval'",
];

const styleSrc = [
  "'self'",
  "'unsafe-inline'",
  'https://fonts.googleapis.com',
];

const imgSrc = [
  "'self'",
  'data:',
  'blob:',
  'https://res.cloudinary.com',
];

const connectSrc = [
  "'self'",
  'https://*.ingest.sentry.io',
  'https://suggestions.dadata.ru',
  'https://api.cloudinary.com',
];

export function buildContentSecurityPolicy() {
  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    `style-src ${styleSrc.join(' ')}`,
    `img-src ${imgSrc.join(' ')}`,
    "font-src 'self' https://fonts.gstatic.com data:",
    `connect-src ${connectSrc.join(' ')}`,
    "frame-src 'self' https://yoomoney.ru https://*.yookassa.ru",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

export function buildSecurityHeaders({ includeHsts = process.env.NODE_ENV === 'production' } = {}) {
  const headers = [
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    { key: 'Content-Security-Policy', value: buildContentSecurityPolicy() },
  ];

  if (includeHsts) {
    headers.push({
      key: 'Strict-Transport-Security',
      value: 'max-age=31536000; includeSubDomains; preload',
    });
  }

  return headers;
}
