import type { SetupInfo } from '../shared/types.ts';
import { pluginVersion } from '../shared/version.ts';
import type { Translate } from './copy.ts';

export function EngineSetup({ setup, disabled, retry, useDefault, t }: { setup: SetupInfo; disabled?: boolean; retry?: () => void; useDefault?: () => void; t: Translate }) {
  const restart = setup.pluginVersion !== pluginVersion;
  const unavailable = !setup.engineReady;
  return <section className={'er-engineStatus' + (restart || unavailable ? ' needs-attention' : '')} aria-label={t('engineStatus')}>
    <strong>{t(restart ? 'engineRestartTitle' : unavailable ? 'engineMissingTitle' : 'engineReadyTitle')}</strong>
    <p>{t(restart ? 'engineRestartHint' : unavailable ? (setup.engine?.source === 'custom' ? 'engineCustomMissingHint' : setup.engine?.source === 'environment' ? 'engineEnvironmentHint' : 'engineMissingHint') : 'engineAutomaticHint')}</p>
    <small>{t('pluginVersion')} {pluginVersion} · {t('hostVersion')} {setup.pluginVersion ?? t('olderVersion')} · Explainroo {setup.engine?.version ?? setup.engine?.expectedVersion ?? '—'}</small>
    {(retry || useDefault) && (restart || unavailable) && <div className="er-engineActions">
      {retry && <button className="er-button er-small" disabled={disabled} onClick={retry}>{t('recheckEngine')}</button>}
      {useDefault && setup.engine?.source === 'custom' && setup.engine.defaultReady && <button className="er-button er-small" disabled={disabled} onClick={useDefault}>{t('useDefaultEngine')}</button>}
    </div>}
    <details open={unavailable && !restart}><summary>{t('engineInstallGuide')}</summary>
      <ol><li>{t('engineInstallStep')}</li><li>{t('engineRestartStep')}</li><li>{t('engineRecheckStep')}</li></ol>
      <a href="https://github.com/AloneAtWar/dsh-explainroo/releases" target="_blank" rel="noreferrer">{t('engineDownload')}</a>
    </details>
  </section>;
}
