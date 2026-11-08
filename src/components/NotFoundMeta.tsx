import { Helmet } from 'react-helmet-async';

/**
 * Head tags for a page that doesn't exist: its own title and noindex, and no
 * canonical. Unknown URLs are served the Overview's HTML, so without this they
 * keep the Overview's title and canonical and look like a copy of it.
 *
 * Only for a confirmed miss (the API said there is no such item), never for a
 * failed request: a backend outage must not tell search engines to drop a
 * real page.
 */
export function NotFoundMeta({ title = 'Page not found' }: { title?: string }) {
  return (
    <Helmet>
      <title>{`${title} | L1Beat`}</title>
      <meta name="robots" content="noindex" />
    </Helmet>
  );
}
