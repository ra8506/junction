import { useCallback, useEffect, useState } from 'react';
import type { Account } from '../../shared/types';
import { MailView } from './views/MailView';
import { CalendarView } from './views/CalendarView';
import { MessagesView } from './views/MessagesView';
import { SettingsView } from './views/SettingsView';

type Tab = 'mail' | 'calendar' | 'messages' | 'settings';

const TABS: { id: Tab; label: string; icon: string; key: string }[] = [
  { id: 'mail', label: 'Mail', icon: '✉', key: '1' },
  { id: 'calendar', label: 'Calendar', icon: '▦', key: '2' },
  { id: 'messages', label: 'Messages', icon: '💬', key: '3' },
  { id: 'settings', label: 'Accounts', icon: '⚙', key: '4' }
];

export function App() {
  const [tab, setTab] = useState<Tab>('mail');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const refreshAccounts = useCallback(() => window.junction.accounts.list().then(setAccounts), []);

  useEffect(() => {
    void refreshAccounts();
  }, [refreshAccounts]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey) return;
      const t = TABS.find((x) => x.key === e.key);
      if (t) {
        e.preventDefault();
        setTab(t.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <nav className="rail">
        <div className="brand" title="Junction">J</div>
        {TABS.map((t) => (
          <button key={t.id} className={`rail-btn ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)} title={`${t.label} (Ctrl+${t.key})`}>
            <span className="rail-icon">{t.icon}</span>
            <span className="rail-label">{t.label}</span>
          </button>
        ))}
      </nav>
      <main className="content">
        {tab === 'mail' && <MailView accounts={accounts} onAddAccount={() => setTab('settings')} />}
        {tab === 'calendar' && <CalendarView accounts={accounts} />}
        {tab === 'messages' && <MessagesView />}
        {tab === 'settings' && <SettingsView accounts={accounts} onChange={refreshAccounts} />}
      </main>
    </div>
  );
}
