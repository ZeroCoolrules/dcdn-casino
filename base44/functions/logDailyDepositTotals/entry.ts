import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Logs a day's player deposit totals to a Notion database.
//
// - Aggregates on-chain credits (CreditedDeposit) and approved manual deposits
//   (Deposit, status 'approved') for the given UTC day, server-side.
// - Writes one row per day to a Notion database resolved by title
//   "Dreamcadian Deposit Totals" (or an explicit database_id override).
// - Auto-provisions the Date/number columns if missing, so the operator only
//   has to create an empty database and connect the Dreamcadian integration.
// - Idempotent: re-running for a date updates that date's row instead of adding
//   a duplicate, so a scheduled daily job and manual tests never pile up rows.
//
// This is a scheduled/operator job with no app-user session, so it runs entirely
// under the service role (like the platform's scheduled-task pattern) and
// returns only the aggregate totals — no per-player data.

const NOTION_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2025-09-03';
const DB_TITLE = 'Dreamcadian Deposit Totals';

function isoRange(dateStr) {
  const start = new Date(dateStr + 'T00:00:00.000Z');
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

function yesterdayUTC() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function readSum(res, field) {
  if (!res) return 0;
  const rows = res.rows;
  if (Array.isArray(rows) && rows.length) {
    return rows[0][`sum_${field}`] ?? rows[0].sum ?? 0;
  }
  return res[`sum_${field}`] ?? res.sum ?? 0;
}

function dataSourceName(r) {
  if (typeof r.name === 'string') return r.name;
  if (Array.isArray(r.title)) return r.title.map((t) => t.plain_text || '').join('');
  return '';
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json().catch(() => ({}));
    const dateStr = String(body.date || '').trim() || yesterdayUTC();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return Response.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('notion');
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    };

    // Resolve the target data source id (the row-creation parent per Notion 2025-09-03).
    let dataSourceId = '';
    if (body.database_id) {
      const dbRes = await fetch(`${NOTION_BASE}/databases/${body.database_id}`, {
        headers,
        signal: AbortSignal.timeout(15000),
      });
      if (!dbRes.ok) {
        return Response.json({ error: 'Could not open the provided Notion database' }, { status: 400 });
      }
      const dbJson = await dbRes.json();
      const sources = dbJson.data_sources || [];
      if (!sources.length) {
        return Response.json({ error: 'Notion database has no data source' }, { status: 400 });
      }
      dataSourceId = sources[0].id;
    } else {
      const searchRes = await fetch(`${NOTION_BASE}/search`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          filter: { value: 'data_source', property: 'object' },
          query: DB_TITLE,
          page_size: 50,
        }),
        signal: AbortSignal.timeout(15000),
      });
      const searchJson = await searchRes.json();
      const results = searchJson.results || [];
      if (!results.length) {
        return Response.json(
          {
            ok: false,
            error: `Notion database "${DB_TITLE}" not found. Create an empty database with that name in Notion, then connect the Dreamcadian integration to it (open the database → ••• → Connect to → choose the integration). It will be picked up on the next run.`,
          },
          { status: 404 }
        );
      }
      const exact = results.find((r) => dataSourceName(r) === DB_TITLE);
      dataSourceId = (exact || results[0]).id;
    }

    // Read the data source schema to locate its title property.
    const dsRes = await fetch(`${NOTION_BASE}/data_sources/${dataSourceId}`, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    const dsJson = await dsRes.json();
    const props = dsJson.properties || {};
    let titleKey = '';
    for (const [k, p] of Object.entries(props)) {
      if (p && p.type === 'title') {
        titleKey = k;
        break;
      }
    }
    if (!titleKey) {
      return Response.json({ error: 'Notion database has no title property' }, { status: 400 });
    }

    // Auto-provision any missing columns in one schema patch.
    const desired = {
      Date: { type: 'date', date: {} },
      'Total DCDN': { type: 'number', number: {} },
      'On-Chain DCDN': { type: 'number', number: {} },
      'Manual DCDN': { type: 'number', number: {} },
      Deposits: { type: 'number', number: {} },
      'On-Chain Deposits': { type: 'number', number: {} },
      'Manual Deposits': { type: 'number', number: {} },
    };
    const missing = {};
    for (const [k, def] of Object.entries(desired)) {
      if (!props[k]) missing[k] = def;
    }
    if (Object.keys(missing).length) {
      await fetch(`${NOTION_BASE}/data_sources/${dataSourceId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ properties: missing }),
        signal: AbortSignal.timeout(15000),
      });
    }

    // Aggregate the day's deposits server-side (no records pulled into memory).
    const range = isoRange(dateStr);
    const dateQuery = { created_date: { $gte: range.start, $lt: range.end } };
    const [onChainCount, onChainAgg, manualCount, manualAgg] = await Promise.all([
      base44.asServiceRole.entities.CreditedDeposit.count(dateQuery),
      base44.asServiceRole.entities.CreditedDeposit.aggregate({ query: dateQuery, sum: 'amount' }),
      base44.asServiceRole.entities.Deposit.count({ status: 'approved', ...dateQuery }),
      base44.asServiceRole.entities.Deposit.aggregate({ query: { status: 'approved', ...dateQuery }, sum: 'credited_amount' }),
    ]);
    const onChainSum = Math.round((Number(readSum(onChainAgg, 'amount')) || 0) * 100) / 100;
    const manualSum = Math.round((Number(readSum(manualAgg, 'credited_amount')) || 0) * 100) / 100;
    const totals = {
      date: dateStr,
      total: Math.round((onChainSum + manualSum) * 100) / 100,
      on_chain_total: onChainSum,
      manual_total: manualSum,
      on_chain_count: onChainCount || 0,
      manual_count: manualCount || 0,
      deposit_count: (onChainCount || 0) + (manualCount || 0),
    };

    const rowProps = {};
    rowProps[titleKey] = { title: [{ text: { content: dateStr } }] };
    rowProps['Date'] = { date: { start: dateStr } };
    rowProps['Total DCDN'] = { number: totals.total };
    rowProps['On-Chain DCDN'] = { number: totals.on_chain_total };
    rowProps['Manual DCDN'] = { number: totals.manual_total };
    rowProps['Deposits'] = { number: totals.deposit_count };
    rowProps['On-Chain Deposits'] = { number: totals.on_chain_count };
    rowProps['Manual Deposits'] = { number: totals.manual_count };

    // Idempotency: update the row for this date if it exists, else create it.
    const queryRes = await fetch(`${NOTION_BASE}/data_sources/${dataSourceId}/query`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ filter: { property: 'Date', date: { equals: dateStr } }, page_size: 5 }),
      signal: AbortSignal.timeout(15000),
    });
    const queryJson = await queryRes.json();
    const existing = (queryJson.results || [])[0];

    let pageId = '';
    if (existing) {
      pageId = existing.id;
      await fetch(`${NOTION_BASE}/pages/${pageId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ properties: rowProps }),
        signal: AbortSignal.timeout(15000),
      });
    } else {
      const createRes = await fetch(`${NOTION_BASE}/pages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          parent: { type: 'data_source_id', data_source_id: dataSourceId },
          properties: rowProps,
        }),
        signal: AbortSignal.timeout(15000),
      });
      const createJson = await createRes.json();
      if (!createRes.ok) {
        return Response.json({ error: 'Failed to create Notion row', details: createJson }, { status: 502 });
      }
      pageId = createJson.id || '';
    }

    return Response.json({ ok: true, ...totals, notion_page_id: pageId });
  } catch (error) {
    return Response.json({ error: error.message || 'log failed' }, { status: 500 });
  }
}