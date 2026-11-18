import React, { useEffect, useRef, useState } from 'react';
import { createScreenWakeLock } from './screen-wake-lock.js';

export function ScreenAwake() {
  const [status, setStatus] = useState('requesting');
  const controller = useRef(null);
  useEffect(() => {
    const current = createScreenWakeLock({ navigator, document, secureContext: window.isSecureContext, onStatus: setStatus });
    controller.current = current;
    current.start();
    return () => { controller.current = null; current.stop(); };
  }, []);
  const messages = {
    requesting: 'Requesting screen stay-awake…',
    active: 'Screen stay-awake is on. Keep this controller in the foreground.',
    insecure: 'Automatic stay-awake needs HTTPS. For this LAN playtest, extend your phone’s screen timeout manually.',
    unsupported: 'This browser cannot keep the screen awake automatically. Extend your phone’s screen timeout manually.',
    denied: 'Stay-awake was blocked, possibly by battery-saving settings. Retry or extend your screen timeout manually.',
    released: 'Screen stay-awake was released by your browser. Retry or extend your screen timeout manually.',
    hidden: 'Return to this controller to resume screen stay-awake. The game clock keeps running.',
  };
  return <div className={`screen-awake ${status === 'active' ? 'enabled' : ''}`}>
    <p role="status">{messages[status]}</p>
    {['denied', 'released'].includes(status) && <button type="button" className="text-link" onClick={() => controller.current?.retry()}>Retry screen stay-awake</button>}
  </div>;
}
