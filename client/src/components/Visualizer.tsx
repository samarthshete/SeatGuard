import { useEffect, useState } from 'react';

interface LogRecord {
    id: string;
    message: string;
    timestamp: Date;
}

// Real stats fetched from the API's GET /api/stats endpoint. These are NOT
// fabricated client-side counters — every value is computed by the server.
export interface LiveStats {
    booked: number;
    held: number;
    available: number;
    conflicts: number;
    lastMessage: string;
}

export default function Visualizer({ stats }: { stats: LiveStats }) {
    const [logs, setLogs] = useState<LogRecord[]>([]);

    const isLive = stats.booked + stats.available > 0;

    // Append a bounded (last-10) log entry whenever the latest message changes.
    useEffect(() => {
        const newLog: LogRecord = {
            id: Math.random().toString(36).slice(2, 11),
            message: stats.lastMessage || 'System Idle',
            timestamp: new Date()
        };
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLogs(prev => [newLog, ...prev].slice(0, 10));
    }, [stats.lastMessage]);

    return (
        <div className="visualizer-container animate-in fade-in slide-in-from-bottom-5">
            <div className="visualizer-header">
                <h3>Live Stats 📊</h3>
                <div className={`status-pill ${isLive ? 'online' : 'offline'}`}>
                    <span className="dot"></span>
                    {isLive ? 'Live (server data)' : 'Connecting…'}
                </div>
            </div>

            <div className="telemetry-grid">
                <div className="telemetry-card">
                    <label>Booked</label>
                    <div className="val">{stats.booked}</div>
                </div>
                <div className="telemetry-card">
                    <label>Held</label>
                    <div className="val">{stats.held}</div>
                </div>
                <div className="telemetry-card">
                    <label>Available</label>
                    <div className="val">{stats.available}</div>
                </div>
                <div className="telemetry-card">
                    <label>Conflicts (409)</label>
                    <div className="val">{stats.conflicts}</div>
                </div>
            </div>

            <div className="live-log">
                {logs.map(log => (
                    <div key={log.id} className="log-entry">
                        <span className="tag db">EVENT</span>
                        <span className="msg">{log.message}</span>
                        <span className="time">{log.timestamp.toLocaleTimeString()}</span>
                    </div>
                ))}
            </div>

            <style>{`
                .visualizer-container {
                    background: #0a0a0a;
                    border: 1px solid #333;
                    border-radius: 12px;
                    padding: 1.5rem;
                    margin-top: 2rem;
                    color: #fff;
                    font-family: 'Inter', sans-serif;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                }
                .visualizer-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 1.5rem;
                }
                .status-pill {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    font-size: 0.65rem;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    background: rgba(255,255,255,0.05);
                    padding: 4px 10px;
                    border-radius: 20px;
                    border: 1px solid rgba(255,255,255,0.1);
                }
                .status-pill.online { color: #00ff88; border-color: rgba(0,255,136,0.3); }
                .status-pill.offline { color: #888; }
                .status-pill .dot {
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: currentColor;
                    box-shadow: 0 0 10px currentColor;
                }
                .telemetry-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 1rem;
                    margin: 1rem 0;
                }
                .telemetry-card {
                    background: #1a1a1a;
                    padding: 1rem;
                    border-radius: 8px;
                    text-align: center;
                }
                .telemetry-card label {
                    display: block;
                    font-size: 0.6rem;
                    color: #888;
                    text-transform: uppercase;
                    margin-bottom: 0.5rem;
                }
                .telemetry-card .val {
                    font-size: 1.5rem;
                    font-weight: bold;
                    color: #00ff88;
                }
                .live-log {
                    margin-top: 1rem;
                    font-size: 0.7rem;
                    height: 120px;
                    overflow-y: hidden;
                    border-top: 1px solid #333;
                    padding-top: 1rem;
                }
                .log-entry {
                    display: flex;
                    gap: 0.5rem;
                    margin-bottom: 0.4rem;
                    opacity: 0.8;
                }
                .tag {
                    font-weight: bold;
                    padding: 1px 4px;
                    border-radius: 3px;
                }
                .tag.db { background: #00ff88; color: #000; }
                .msg { flex: 1; color: #ccc; }
                .time { color: #555; }
            `}</style>
        </div>
    );
}
