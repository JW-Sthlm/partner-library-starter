/**
 * Application Insights wiring for the partner library.
 *
 * Loads only in the browser. Reads the connection string from the
 * VITE_APPINSIGHTS_CONNECTION_STRING build-time env var. If the var
 * is missing (e.g. local dev without a key), every helper here
 * silently no-ops. The site still works.
 *
 * Privacy posture:
 *   - No Entra/auth identity sent (telemetry initializer scrubs user info).
 *   - No PII in custom events. Only URL paths, anonymized client/session IDs,
 *     and event payloads we control.
 *   - Anonymous client ID stored in cookie + localStorage by the SDK.
 *     This is what enables unique-visitor counting.
 */

import type { Router } from 'vitepress';

type AppInsights = import('@microsoft/applicationinsights-web').ApplicationInsights;

let appInsights: AppInsights | null = null;
let initialized = false;

function readConnectionString(): string | undefined {
  const cs = (import.meta as any).env?.VITE_APPINSIGHTS_CONNECTION_STRING;
  return typeof cs === 'string' && cs.length > 0 ? cs : undefined;
}

export async function initAnalytics(router: Router): Promise<void> {
  if (typeof window === 'undefined') return;
  if (initialized) return;
  initialized = true;

  const connectionString = readConnectionString();
  if (!connectionString) {
    return;
  }

  const { ApplicationInsights } = await import('@microsoft/applicationinsights-web');

  appInsights = new ApplicationInsights({
    config: {
      connectionString,
      enableAutoRouteTracking: false,
      disableAjaxTracking: true,
      disableFetchTracking: true,
      disableExceptionTracking: false,
      disableCorrelationHeaders: true,
      autoTrackPageVisitTime: true,
    },
  });

  appInsights.loadAppInsights();

  appInsights.addTelemetryInitializer((envelope) => {
    if (envelope.tags) {
      delete envelope.tags['ai.user.authUserId'];
      delete envelope.tags['ai.user.accountId'];
    }
    if ((envelope.data as any)?.baseData) {
      const baseData = (envelope.data as any).baseData;
      delete baseData.authUserId;
      delete baseData.accountId;
    }
  });

  trackCurrentPage();

  router.onAfterRouteChange = () => {
    trackCurrentPage();
  };

  installOutboundLinkListener();
}

function trackCurrentPage(): void {
  if (!appInsights) return;
  appInsights.trackPageView({
    name: document.title,
    uri: window.location.pathname + window.location.search,
  });
  // Flush immediately so pageViews aren't lost when a user clicks an
  // outbound link before the SDK's batch timer fires. async=true uses
  // sendBeacon under the hood and is non-blocking.
  try { appInsights.flush(true); } catch { /* noop */ }
}

export function trackEvent(
  name: string,
  properties?: Record<string, string | number | boolean | undefined>
): void {
  if (!appInsights) return;
  appInsights.trackEvent({ name }, properties as Record<string, any>);
}

function installOutboundLinkListener(): void {
  document.addEventListener(
    'click',
    (e) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const anchor = target.closest('a') as HTMLAnchorElement | null;
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (!href) return;

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
      if (url.host === window.location.host) return;

      trackEvent('OutboundLinkClick', {
        url: url.href,
        host: url.host,
        text: (anchor.textContent || '').trim().slice(0, 200),
        fromPath: window.location.pathname,
      });
    },
    { capture: true }
  );
}
