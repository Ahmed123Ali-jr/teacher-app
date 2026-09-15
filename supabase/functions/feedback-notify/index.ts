/* ==========================================================================
   feedback-notify — ملاحظةُ المعلّم تصل بريدَه لا تنتظر في جدول
   --------------------------------------------------------------------------
   جدولُ `feedback` صُمّم «يكتب ولا يقرأ»، ونصَّت هجرتُه على أنّه **يُقرأ
   من لوحة سوبابيس بالعين**. وهذا كافٍ لمشروعٍ بلا مستخدمين، ويسقط مع
   أوّل خمسة آلاف معلّم: بلاغُ «التطبيق ما يفتح» يجلس في صفٍّ أسبوعين
   لأنّ لا شيءَ يقول إنّه وصل.

   فصار مشغّلٌ بعد الإدخال يستدعي هذه الدالّةَ بـ`pg_net`، وهي ترسل
   بريداً عبر Resend — النطاقُ موثَّقٌ عنده أصلاً و`noreply@fusooli.com`
   يُرسل منذ ٥ سبتمبر.

   ── ثلاثةُ قرارات ──

   ١) **لا تُفشل الإدخال أبداً.** المشغّلُ يبتلع خطأَه، والدالّةُ تردّ
      ‎200‎ حتى حين يفشل الإرسال. ملاحظةُ المعلّم محفوظةٌ في الجدول سواءٌ
      وصل البريدُ أم لا — والبريدُ تحسينٌ لا شرط.

   ٢) **النصُّ يُهرَّب.** يكتبه معلّمٌ ويُقرأ في عميل بريدٍ يعرض HTML،
      فـ`<img onerror=…>` في ملاحظةٍ يصير ثغرةً في صندوقك أنت.

   ٣) **لا مفتاحَ في الشيفرة.** `RESEND_API_KEY` سرٌّ في المشروع. وإن
      غاب ردّت الدالّةُ ‎200‎ مع `skipped` — فلا ينكسر شيءٌ قبل ضبطه.
   ========================================================================== */

const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const TO         = 'fusool96@gmail.com';
const FROM       = 'فصول <noreply@fusooli.com>';

/* أسماءُ الأنواع كما تظهر للمعلّم في الشاشة نفسِها. */
const KINDS: Record<string, { label: string; icon: string }> = {
    bug:    { label: 'بلاغ عطب',   icon: '🐞' },
    idea:   { label: 'اقتراح',     icon: '💡' },
    ask:    { label: 'سؤال',       icon: '❓' },
    thanks: { label: 'شكر',        icon: '🌟' }
};

function json(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), {
        status, headers: { 'Content-Type': 'application/json' }
    });
}

function esc(s: unknown): string {
    return String(s ?? '').replace(/[&<>"']/g, (m) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m] as string));
}

/* التاريخُ بتوقيت الرياض: من يقرأ البريدَ هناك، لا في UTC. */
function riyadh(iso: unknown): string {
    try {
        return new Intl.DateTimeFormat('ar-SA', {
            dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Riyadh'
        }).format(new Date(String(iso)));
    } catch { return String(iso ?? ''); }
}

Deno.serve(async (req) => {
    if (req.method !== 'POST') return json({ error: 'POST فقط' }, 405);

    let row: Record<string, unknown>;
    try {
        const b = await req.json();
        /* المشغّلُ يرسل الصفَّ مباشرةً؛ وويب-هوك سوبابيس يلفّه في `record`. */
        row = (b && typeof b === 'object' && 'record' in b) ? b.record : b;
    } catch {
        return json({ error: 'جسمٌ غيرُ صالح' }, 400);
    }
    if (!row || typeof row !== 'object') return json({ error: 'لا صفّ' }, 400);

    if (!RESEND_KEY) {
        console.warn('[feedback-notify] RESEND_API_KEY غيرُ مضبوط — لا إرسال');
        return json({ ok: true, skipped: 'no-key' });
    }

    const kind = KINDS[String(row.kind)] ?? { label: String(row.kind ?? '—'), icon: '✉️' };
    const body = esc(row.body).replace(/\n/g, '<br>');

    const html = `
<div dir="rtl" style="font-family:-apple-system,'Segoe UI',Tahoma,sans-serif;
     background:#F0EDE5;padding:24px;color:#22282B;line-height:1.85">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;
       border:1px solid #DDD7C9;overflow:hidden">
    <div style="background:#0A3F4A;color:#fff;padding:16px 20px">
      <div style="font-size:18px;font-weight:700">${kind.icon} ${esc(kind.label)}</div>
      <div style="font-size:12px;opacity:.75;margin-top:2px">ملاحظةٌ جديدةٌ من معلّم</div>
    </div>
    <div style="padding:20px;font-size:15px;white-space:pre-wrap">${body}</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;color:#6B7278">
      <tr><td style="padding:7px 20px;border-top:1px solid #EFEAE0">التاريخ</td>
          <td style="padding:7px 20px;border-top:1px solid #EFEAE0">${esc(riyadh(row.created_at))}</td></tr>
      <tr><td style="padding:7px 20px;border-top:1px solid #EFEAE0">الإصدار</td>
          <td style="padding:7px 20px;border-top:1px solid #EFEAE0">${esc(row.app_version) || '—'}</td></tr>
      <tr><td style="padding:7px 20px;border-top:1px solid #EFEAE0">المعلّم</td>
          <td style="padding:7px 20px;border-top:1px solid #EFEAE0;font-family:monospace;direction:ltr">${esc(row.teacher_id) || '— حُذف حسابه —'}</td></tr>
      <tr><td style="padding:7px 20px;border-top:1px solid #EFEAE0">الجهاز</td>
          <td style="padding:7px 20px;border-top:1px solid #EFEAE0;direction:ltr;font-size:11px">${esc(row.agent) || '—'}</td></tr>
    </table>
  </div>
  <p style="max-width:560px;margin:14px auto 0;font-size:11.5px;color:#6B7278">
    وصلتك من «فصول». ولا تردّ على هذا العنوان — <b>النطاقُ يُرسل ولا يستقبل</b>.
  </p>
</div>`;

    try {
        const r = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: FROM, to: [TO],
                subject: `${kind.icon} ملاحظة جديدة — ${kind.label}`,
                html
            })
        });
        if (!r.ok) {
            /* ‎200‎ رغم الفشل: الصفُّ محفوظٌ، والبريدُ تحسينٌ لا شرط. */
            console.error('[feedback-notify] Resend ردّ', r.status, (await r.text()).slice(0, 300));
            return json({ ok: false, status: r.status });
        }
        return json({ ok: true });
    } catch (e) {
        console.error('[feedback-notify] تعذّر الإرسال:', e instanceof Error ? e.message : e);
        return json({ ok: false });
    }
});
