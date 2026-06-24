// Vercel Serverless Function — microCMS プロキシ
// APIキーは Vercel の環境変数に置き、ブラウザには一切露出させません。
//
// 必要な環境変数（Vercel の Project Settings → Environment Variables）:
//   MICROCMS_SERVICE_DOMAIN  例: your-service        ( https://your-service.microcms.io の your-service 部分 )
//   MICROCMS_API_KEY         microCMS の API キー
//   MICROCMS_ENDPOINT        任意。未設定なら "blogs"（microCMS の API のエンドポイント名）
//
// 使い方:
//   GET /api/blog                 → 記事一覧
//   GET /api/blog?limit=20&offset=0&q=keyword
//   GET /api/blog?id=XXXXXXXX     → 記事1件の詳細

module.exports = async (req, res) => {
  const domain = process.env.MICROCMS_SERVICE_DOMAIN;
  const apiKey = process.env.MICROCMS_API_KEY;
  const endpoint = process.env.MICROCMS_ENDPOINT || "blogs";

  if (!domain || !apiKey) {
    res.status(500).json({
      error:
        "サーバー側の設定が未完了です。Vercel に MICROCMS_SERVICE_DOMAIN と MICROCMS_API_KEY を設定してください。",
    });
    return;
  }

  // クエリ取り出し（許可したパラメータのみ通す）
  const { id, limit, offset, q, orders, fields } = req.query;

  let url = `https://${domain}.microcms.io/api/v1/${endpoint}`;
  const params = new URLSearchParams();

  if (id) {
    // 詳細取得
    url += `/${encodeURIComponent(id)}`;
  } else {
    // 一覧取得
    params.set("limit", limit && /^\d+$/.test(limit) ? limit : "20");
    if (offset && /^\d+$/.test(offset)) params.set("offset", offset);
    params.set("orders", typeof orders === "string" ? orders : "-publishedAt");
    if (q) params.set("q", String(q));
    if (fields) params.set("fields", String(fields));
  }

  const finalUrl = params.toString() ? `${url}?${params.toString()}` : url;

  try {
    const upstream = await fetch(finalUrl, {
      headers: { "X-MICROCMS-API-KEY": apiKey },
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      res.status(upstream.status).json({
        error: "microCMS からの取得に失敗しました。",
        status: upstream.status,
        detail: text.slice(0, 500),
      });
      return;
    }

    const data = await upstream.json();

    // CDN キャッシュ（60秒。stale-while-revalidate で表示の体感を速く）
    res.setHeader(
      "Cache-Control",
      "s-maxage=60, stale-while-revalidate=300"
    );
    res.status(200).json(data);
  } catch (err) {
    res.status(502).json({
      error: "microCMS への接続に失敗しました。",
      detail: String(err && err.message ? err.message : err),
    });
  }
};
