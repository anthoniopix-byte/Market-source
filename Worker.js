const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'no-store'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    const url = new URL(request.url);

    // Endpoint racine
    if (!url.pathname.startsWith('/api/')) {
      return json({
        ok: true,
        service: 'Market Source API Gateway'
      });
    }

    try {

      // =========================
      // HEALTH CHECK
      // =========================
      if (url.pathname === '/api/health') {
        return json({
          ok: true,
          service: 'Market Source API Gateway',
          providers: {
            twelveData: Boolean(env.TWELVEDATA_API_KEY),
            fred: Boolean(env.FRED_API_KEY)
          },
          time: new Date().toISOString()
        });
      }

      // =========================
      // MARKET DATA
      // =========================
      if (url.pathname === '/api/market') {

        if (!env.TWELVEDATA_API_KEY) {
          return json({
            error: 'TWELVEDATA_API_KEY secret missing'
          }, 503);
        }

        const symbol = url.searchParams.get('symbol');
        const interval =
          url.searchParams.get('interval') || '5min';

        const outputsize =
          url.searchParams.get('outputsize') || '5000';

        // Timeframes autorisés
        const allowed = new Set([
          '1min',
          '5min',
          '15min',
          '30min',
          '45min',
          '1h',
          '2h',
          '4h',
          '8h',
          '1day',
          '1week',
          '1month'
        ]);

        if (!symbol || !allowed.has(interval)) {
          return json({
            error: 'Invalid symbol or interval'
          }, 400);
        }

        const api = new URL(
          'https://api.twelvedata.com/time_series'
        );

        api.searchParams.set(
          'symbol',
          symbol
        );

        api.searchParams.set(
          'interval',
          interval
        );

        api.searchParams.set(
          'outputsize',
          outputsize
        );

        // La clé reste côté Cloudflare Worker
        api.searchParams.set(
          'apikey',
          env.TWELVEDATA_API_KEY
        );

        const response = await fetch(
          api.toString(),
          {
            cf: {
              cacheTtl: 0
            }
          }
        );

        const body = await response.text();

        return new Response(
          body,
          {
            status: response.status,
            headers: {
              ...cors,
              'Content-Type':
                'application/json'
            }
          }
        );
      }

      // =========================
      // FRED
      // =========================
      if (url.pathname === '/api/fred') {

        if (!env.FRED_API_KEY) {
          return json({
            error: 'FRED_API_KEY secret missing'
          }, 503);
        }

        const seriesId =
          url.searchParams.get('series_id');

        if (!seriesId) {
          return json({
            error: 'series_id required'
          }, 400);
        }

        const api = new URL(
          'https://api.stlouisfed.org/fred/series/observations'
        );

        api.searchParams.set(
          'series_id',
          seriesId
        );

        api.searchParams.set(
          'api_key',
          env.FRED_API_KEY
        );

        api.searchParams.set(
          'file_type',
          'json'
        );

        api.searchParams.set(
          'sort_order',
          'desc'
        );

        api.searchParams.set(
          'limit',
          url.searchParams.get('limit') || '100'
        );

        const response = await fetch(
          api.toString(),
          {
            cf: {
              cacheTtl: 0
            }
          }
        );

        const body = await response.text();

        return new Response(
          body,
          {
            status: response.status,
            headers: {
              ...cors,
              'Content-Type':
                'application/json'
            }
          }
        );
      }

      // =========================
      // ENDPOINT INCONNU
      // =========================
      return json({
        error: 'Unknown endpoint'
      }, 404);

    } catch (error) {

      return json({
        error:
          error?.message ||
          'Gateway error'
      }, 500);
    }
  }
};
