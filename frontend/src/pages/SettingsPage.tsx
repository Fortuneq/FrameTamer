import { useState, useEffect } from 'react';
import { MaterialIcon } from '../components/ui/MaterialIcon';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Switch } from '../components/ui/Switch';
import { Select } from '../components/ui/Select';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import type { SettingsTab } from '../types';
import clsx from 'clsx';

const STORAGE_KEY = 'app_settings';

interface AppSettings {
  displayName: string;
  email: string;
  autoSave: boolean;
  hwAccel: boolean;
  autoTranscript: boolean;
  defaultLanguage: string;
}

const defaultSettings: AppSettings = {
  displayName: '',
  email: '',
  autoSave: true,
  hwAccel: true,
  autoTranscript: true,
  defaultLanguage: 'en',
};

function loadSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...defaultSettings, ...JSON.parse(stored) };
  } catch {
    // ignore
  }
  return defaultSettings;
}

function saveSettings(settings: AppSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

const tabs: { id: SettingsTab; label: string; icon: string }[] = [
  { id: 'general', label: 'General', icon: 'person' },
  { id: 'subscription', label: 'AI & Claude', icon: 'smart_toy' },
  { id: 'ai_models', label: 'AI Models', icon: 'psychology' },
  { id: 'shortcuts', label: 'Shortcuts', icon: 'keyboard' },
  { id: 'storage', label: 'Storage', icon: 'hard_drive' },
];

function StorageTab() {
  const [info, setInfo] = useState<{ dataDir: string; projectCount: number; totalSize: string } | null>(null);

  useEffect(() => {
    // Get dataDir from status
    fetch('/api/status')
      .then(r => r.json())
      .then(data => {
        const dataDir = data.dataDir ?? '';
        // Get project count
        return fetch('/api/projects').then(r => r.json()).then((projects: unknown[]) => {
          setInfo({
            dataDir,
            projectCount: projects.length,
            totalSize: '—',
          });
        });
      })
      .catch(() => {});
  }, []);

  const handleOpenFolder = () => {
    if (!info?.dataDir) return;
    // In Electron, use shell.openPath via IPC. Fallback: copy path.
    if (window.electronAPI) {
      // If we have electron API, it could open folder
      navigator.clipboard?.writeText(info.dataDir);
    }
    // Use backend to open folder
    fetch('/api/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: info.dataDir }),
    }).catch(() => {
      // Fallback: copy to clipboard
      navigator.clipboard?.writeText(info.dataDir ?? '');
      alert(`Folder path copied: ${info.dataDir}`);
    });
  };

  return (
    <section>
      <h2 className="mb-4 text-base font-semibold text-md-on-surface">Storage</h2>
      <Card className="p-4 space-y-4">
        <div>
          <p className="text-sm font-medium text-md-on-surface mb-1">Data Directory</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg bg-md-surface-container-high px-3 py-2 text-xs font-mono text-md-on-surface-variant break-all">
              {info?.dataDir ?? 'Loading...'}
            </code>
            <Button variant="outline" size="sm" onClick={handleOpenFolder}>
              <MaterialIcon name="folder_open" size={16} />
              Open
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="rounded-xl bg-md-surface-container-high p-3">
            <p className="text-lg font-semibold text-md-on-surface">{info?.projectCount ?? '—'}</p>
            <p className="text-xs text-md-on-surface-variant">Projects</p>
          </div>
          <div className="rounded-xl bg-md-surface-container-high p-3">
            <p className="text-lg font-semibold text-md-on-surface">{info?.totalSize ?? '—'}</p>
            <p className="text-xs text-md-on-surface-variant">Total Size</p>
          </div>
        </div>
      </Card>
    </section>
  );
}

function ClaudeConnectionTab() {
  const [status, setStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [claudeVersion, setClaudeVersion] = useState('');
  const [ffmpegOk, setFfmpegOk] = useState(false);
  const [whisperOk, setWhisperOk] = useState(false);
  const [tasks, setTasks] = useState<{ id: string; type: string; status: string; startedAt: string }[]>([]);

  useEffect(() => {
    fetch('/api/agents/tasks')
      .then(res => res.json())
      .then(data => { setTasks(Array.isArray(data) ? data : []); })
      .catch(() => {});

    fetch('/api/status')
      .then(res => res.json())
      .then(data => {
        setStatus(data.claude?.available ? 'connected' : 'error');
        setClaudeVersion(data.claude?.version ?? '');
        setFfmpegOk(data.ffmpeg?.available ?? false);
        setWhisperOk(data.whisper?.available ?? false);
      })
      .catch(() => setStatus('error'));
  }, []);

  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const runningTasks = tasks.filter(t => t.status === 'running').length;

  return (
    <>
      <section>
        <h2 className="mb-4 text-base font-semibold text-md-on-surface">Claude Code Connection</h2>
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-semibold text-md-on-surface">Claude Code CLI</h3>
                {status === 'checking' && <Badge>Checking...</Badge>}
                {status === 'connected' && <Badge variant="success">Connected</Badge>}
                {status === 'error' && <Badge variant="destructive">Not Available</Badge>}
              </div>
              <p className="text-sm text-md-on-surface-variant">
                {status === 'connected'
                  ? `AI features powered by your local Claude Code (${claudeVersion})`
                  : status === 'checking' ? 'Checking...' : 'Install Claude Code CLI to enable AI features'}
              </p>
            </div>
          </div>
          <div className="mt-3 flex gap-3">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${ffmpegOk ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
              <MaterialIcon name={ffmpegOk ? 'check_circle' : 'cancel'} size={14} />
              FFmpeg
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${whisperOk ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              <MaterialIcon name={whisperOk ? 'check_circle' : 'warning'} size={14} />
              Whisper {whisperOk ? '' : '(auto-install)'}
            </span>
          </div>
        </Card>
      </section>

      <section>
        <h2 className="mb-4 text-base font-semibold text-md-on-surface">Agent Activity</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl bg-md-surface-container p-3">
            <div className="flex items-center gap-3">
              <MaterialIcon name="check_circle" size={20} className="text-emerald-500" />
              <span className="text-sm text-md-on-surface">Completed tasks</span>
            </div>
            <span className="text-sm font-semibold text-md-on-surface">{completedTasks}</span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-md-surface-container p-3">
            <div className="flex items-center gap-3">
              <MaterialIcon name="pending" size={20} className="text-blue-500" />
              <span className="text-sm text-md-on-surface">Running now</span>
            </div>
            <span className="text-sm font-semibold text-md-on-surface">{runningTasks}</span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-md-surface-container p-3">
            <div className="flex items-center gap-3">
              <MaterialIcon name="history" size={20} className="text-md-on-surface-variant" />
              <span className="text-sm text-md-on-surface">Total tasks</span>
            </div>
            <span className="text-sm font-semibold text-md-on-surface">{tasks.length}</span>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-base font-semibold text-md-on-surface">How it works</h2>
        <div className="space-y-2 text-sm text-md-on-surface-variant">
          <p>ClipForge uses Claude Code CLI agents to perform video editing tasks:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Transcription</strong> — Claude agent runs faster-whisper locally</li>
            <li><strong>Filler word detection</strong> — Claude analyzes transcript context</li>
            <li><strong>Smart editing</strong> — Claude follows your natural language instructions</li>
            <li><strong>Export</strong> — Claude generates and runs ffmpeg commands</li>
          </ul>
          <p className="pt-2">Each task spawns a separate Claude terminal session. You can monitor progress in real-time.</p>
        </div>
      </section>
    </>
  );
}

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [saved, setSaved] = useState(false);

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    saveSettings(settings);
    setSaved(true);
    fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }).catch(() => {
      // saved locally at minimum
    });
  };

  useEffect(() => {
    if (saved) {
      const t = setTimeout(() => setSaved(false), 2000);
      return () => clearTimeout(t);
    }
  }, [saved]);

  return (
    <div className="flex h-full flex-col">
      {/* MD3 Top App Bar */}
      <header className="flex h-16 items-center gap-2.5 bg-md-surface px-6">
        <MaterialIcon name="settings" size={24} className="text-md-on-surface-variant" />
        <h1 className="text-[22px] font-medium text-md-on-surface">Settings</h1>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Settings nav */}
        <nav className="w-[200px] flex-shrink-0 border-r border-md-outline-variant bg-md-surface-container p-3">
          <ul className="space-y-0.5">
            {tabs.map(({ id, label, icon }) => (
              <li key={id}>
                <button
                  onClick={() => setActiveTab(id)}
                  className={clsx(
                    'flex w-full items-center gap-2.5 rounded-full px-3 py-2 text-sm font-medium transition-colors cursor-pointer',
                    activeTab === id
                      ? 'bg-md-secondary-container text-md-on-secondary-container'
                      : 'text-md-on-surface-variant hover:bg-md-surface-container-high',
                  )}
                >
                  <MaterialIcon name={icon} size={20} filled={activeTab === id} />
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Settings content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-[600px] space-y-8">
            {activeTab === 'general' && (
              <>
                <section>
                  <h2 className="mb-4 text-base font-semibold text-md-on-surface">Profile</h2>
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1.5 block text-sm text-md-on-surface-variant">Display Name</label>
                      <Input
                        value={settings.displayName}
                        onChange={(e) => updateSetting('displayName', e.target.value)}
                        placeholder="Enter your name"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm text-md-on-surface-variant">Email</label>
                      <Input
                        value={settings.email}
                        onChange={(e) => updateSetting('email', e.target.value)}
                        type="email"
                        placeholder="Enter your email"
                      />
                    </div>
                    <Button variant="secondary" onClick={handleSave}>
                      {saved ? 'Saved' : 'Save Changes'}
                    </Button>
                  </div>
                </section>

                <section>
                  <h2 className="mb-4 text-base font-semibold text-md-on-surface">Preferences</h2>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-md-on-surface">Auto-save</p>
                        <p className="text-xs text-md-on-surface-variant">Automatically save your project every 30 seconds</p>
                      </div>
                      <Switch checked={settings.autoSave} onCheckedChange={(v) => updateSetting('autoSave', v)} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-md-on-surface">Hardware Acceleration</p>
                        <p className="text-xs text-md-on-surface-variant">Use GPU for video rendering when available</p>
                      </div>
                      <Switch checked={settings.hwAccel} onCheckedChange={(v) => updateSetting('hwAccel', v)} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-md-on-surface">Automatic Transcription</p>
                        <p className="text-xs text-md-on-surface-variant">Start transcription when new media is imported</p>
                      </div>
                      <Switch checked={settings.autoTranscript} onCheckedChange={(v) => updateSetting('autoTranscript', v)} />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm text-md-on-surface-variant">Default Language</label>
                      <Select
                        options={[
                          { value: 'en', label: 'English' },
                          { value: 'es', label: 'Spanish' },
                          { value: 'fr', label: 'French' },
                          { value: 'de', label: 'German' },
                          { value: 'ru', label: 'Russian' },
                          { value: 'ja', label: 'Japanese' },
                          { value: 'zh', label: 'Chinese' },
                        ]}
                        defaultValue={settings.defaultLanguage}
                        className="max-w-[240px]"
                      />
                    </div>
                  </div>
                </section>
              </>
            )}

            {activeTab === 'subscription' && (
              <ClaudeConnectionTab />
            )}

            {activeTab === 'ai_models' && (
              <section>
                <h2 className="mb-4 text-base font-semibold text-md-on-surface">AI Models</h2>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm text-md-on-surface-variant">Transcription Model</label>
                    <Select
                      options={[
                        { value: 'whisper-large', label: 'Whisper Large v3' },
                        { value: 'whisper-medium', label: 'Whisper Medium' },
                        { value: 'whisper-small', label: 'Whisper Small (Faster)' },
                      ]}
                      defaultValue="whisper-large"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm text-md-on-surface-variant">Infographics Generation</label>
                    <Select
                      options={[
                        { value: 'claude-opus', label: 'Claude Opus 4' },
                        { value: 'claude-sonnet', label: 'Claude Sonnet 4' },
                        { value: 'gpt-4o', label: 'GPT-4o' },
                      ]}
                      defaultValue="claude-opus"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm text-md-on-surface-variant">Text Editing</label>
                    <Select
                      options={[
                        { value: 'claude-sonnet', label: 'Claude Sonnet 4' },
                        { value: 'claude-haiku', label: 'Claude Haiku 3.5' },
                        { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
                      ]}
                      defaultValue="claude-sonnet"
                    />
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'shortcuts' && (
              <section>
                <h2 className="mb-4 text-base font-semibold text-md-on-surface">Keyboard Shortcuts</h2>
                <div className="space-y-1">
                  {[
                    { action: 'Play / Pause', keys: 'Space' },
                    { action: 'Undo', keys: 'Cmd + Z' },
                    { action: 'Redo', keys: 'Cmd + Shift + Z' },
                    { action: 'Cut', keys: 'Cmd + X' },
                    { action: 'Split at Playhead', keys: 'S' },
                    { action: 'Delete Selection', keys: 'Backspace' },
                    { action: 'Find', keys: 'Cmd + F' },
                    { action: 'Export', keys: 'Cmd + Shift + E' },
                    { action: 'Save', keys: 'Cmd + S' },
                    { action: 'Zoom In Timeline', keys: 'Cmd + =' },
                    { action: 'Zoom Out Timeline', keys: 'Cmd + -' },
                  ].map(({ action, keys }) => (
                    <div key={action} className="flex items-center justify-between rounded-xl px-3 py-2.5 hover:bg-md-surface-container-high">
                      <span className="text-sm text-md-on-surface">{action}</span>
                      <kbd className="rounded-lg border border-md-outline-variant bg-md-surface-container-high px-2 py-0.5 text-xs font-mono text-md-on-surface-variant">
                        {keys}
                      </kbd>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {activeTab === 'storage' && (
              <StorageTab />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
