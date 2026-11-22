// Раз в 10 минут «дёргает» сервер на Render, чтобы он не засыпал на бесплатном тарифе.
export default async () => {
  const host = (process.env.VPN_HOST || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!host) return;
  try {
    const r = await fetch(`https://${host}/health`, { signal: AbortSignal.timeout(25000) });
    console.log('ping', host, r.status);
  } catch (e) {
    console.log('ping failed', e.message);
  }
};

export const config = { schedule: '*/10 * * * *' };
