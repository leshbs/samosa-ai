/**
 * The shell every SAMOSA email shares. Tables and inline styles because that
 * is what email clients render; no images, so nothing is blocked by default
 * and nothing phones home.
 */

const INK = '#1c1b19'
const MUTED = '#6b6963'
const RULE = '#e1e0d9'
/** Ember 600, the app's one primary-action colour. */
const ACTION = '#c24e16'

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export type EmailFact = { label: string; value: string }

export type EmailLayout = {
  /** Hidden preview line most clients show next to the subject. */
  preheader: string
  heading: string
  paragraphs: string[]
  facts?: EmailFact[]
  action: { label: string; url: string }
  footnote: string
}

export type RenderedEmail = { subject: string; html: string; text: string }

export function renderEmail(subject: string, layout: EmailLayout): RenderedEmail {
  const paragraphs = layout.paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${INK}">${escapeHtml(paragraph)}</p>`,
    )
    .join('')

  const facts = (layout.facts ?? [])
    .map(
      (fact) =>
        `<tr><td style="padding:6px 16px 6px 0;font-size:14px;color:${MUTED}">${escapeHtml(fact.label)}</td>` +
        `<td style="padding:6px 0;font-size:14px;font-weight:600;color:${INK}">${escapeHtml(fact.value)}</td></tr>`,
    )
    .join('')

  const html = `<!doctype html>
<html lang="id">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f7f6f2">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(layout.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f6f2;padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${RULE};border-radius:12px">
<tr><td style="padding:28px 28px 8px;font-family:Helvetica,Arial,sans-serif">
<p style="margin:0 0 20px;font-size:12px;letter-spacing:1px;font-weight:700;color:${MUTED}">SAMOSA</p>
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:${INK}">${escapeHtml(layout.heading)}</h1>
${paragraphs}
${facts ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 20px">${facts}</table>` : ''}
<p style="margin:8px 0 24px"><a href="${escapeHtml(layout.action.url)}" style="display:inline-block;background:${ACTION};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:8px">${escapeHtml(layout.action.label)}</a></p>
</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid ${RULE};font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:${MUTED}">${escapeHtml(layout.footnote)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`

  const text = [
    layout.heading,
    '',
    ...layout.paragraphs.flatMap((paragraph) => [paragraph, '']),
    ...(layout.facts ?? []).map((fact) => `${fact.label}: ${fact.value}`),
    ...(layout.facts?.length ? [''] : []),
    `${layout.action.label}: ${layout.action.url}`,
    '',
    '—',
    layout.footnote,
  ].join('\n')

  return { subject, html, text }
}
