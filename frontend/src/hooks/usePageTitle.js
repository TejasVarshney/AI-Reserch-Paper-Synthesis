import { useEffect } from 'react';

// Sets document.title for the current route/page. Routes unmount on navigation,
// so no restore-on-unmount is needed (and doing so would clobber the next page's title).
const APP = 'Synthesis Engine';

export default function usePageTitle(title) {
  useEffect(() => {
    if (title) document.title = `${title} · ${APP}`;
    else document.title = `${APP} — read many papers as one`;
  }, [title]);
}
