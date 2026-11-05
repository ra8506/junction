import { useMemo, useState } from 'react';
import type { MailBody } from '../../../shared/types';

/**
 * Renders HTML mail in a sandboxed iframe with scripts disabled. Remote images are
 * blocked by CSP until the user opts in, so trackers don't fire on open.
 */
export function MailBodyView({ body }: { body: MailBody }) {
  const [remote, setRemote] = useState(false);
  const html = useMemo(() => {
    if (!body.html) return undefined;
    const csp = `default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data: cid:${remote ? ' https: http:' : ''};`;
    return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>body{font-family:Segoe UI,system-ui,sans-serif;font-size:14px;color:#1d2330;margin:0;padding:4px;word-wrap:break-word}img{max-width:100%;height:auto}</style></head><body>${body.html}</body></html>`;
  }, [body.html, remote]);
  const hasRemote = !!body.html && /<img[^>]+src=["']?https?:/i.test(body.html);

  if (!html) return <pre className="plain-body">{body.text}</pre>;
  return (
    <div className="html-body">
      {hasRemote && !remote && (
        <div className="banner">
          Remote images are blocked to protect your privacy. <button className="link" onClick={() => setRemote(true)}>Load images</button>
        </div>
      )}
      {/* allow-popups lets links open (main process sends them to the default browser) */}
      <iframe title="message" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={html} />
    </div>
  );
}
