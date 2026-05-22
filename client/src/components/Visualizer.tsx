import { useEffect, useState } from 'react';

interface MetricRecord {
    id: string;
    type: 'LOCK' | 'KAFKA' | 'DB';
    message: string;
    timestamp: Date;
}

export default function Visualizer({ metrics }: { metrics: any }) {
    const [logs, setLogs] = useState<MetricRecord[]>([]);

    const isConnected = metrics.kafkaEvents > 0 || metrics.locksAcquired > 0;

    useEffect(() => {
        // Add a log whenever metrics change (simplified for demo)
        const newLog: MetricRecord = {
            id: Math.random().toString(36).substr(2, 9),
            type: metrics.lastActionType || 'DB',
            message: metrics.lastActionMessage || 'System Idle',
            timestamp: new Date()
        };

        setLogs(prev => [newLog, ...prev].slice(0, 10));
    }, [metrics]);

    return (
        <div className="visualizer-container animate-in fade-in slide-in-from-bottom-5">
            <div className="visualizer-header">
                <h3>Engineering Telemetry 🛰️</h3>
                <div className={`status-pill ${isConnected ? 'online' : 'offline'}`}>
                    <span className="dot"></span>
                    {isConnected ? 'Network Live' : 'Systems Standby'}
                </div>
            </div>

            <div className="telemetry-grid">
                <div className="telemetry-card">
                    <label>Redis Locks</label>
                    <div className="val">{metrics.locksAcquired || 0}</div>
                </div>
                <div className="telemetry-card">
                    <label>Kafka Events</label>
                    <div className="val">{metrics.kafkaEvents || 0}</div>
                </div>
                <div className="telemetry-card">
                    <label>DB Writes</label>
                    <div className="val">{metrics.dbWrites || 0}</div>
                </div>
            </div>

            <div className="live-log">
                {logs.map(log => (
                    <div key={log.id} className="log-entry">
                        <span className={`tag ${log.type.toLowerCase()}`}>{log.type}</span>
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
                    grid-template-columns: repeat(3, 1fr);
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
                .tag.lock { background: #ff4444; }
                .tag.kafka { background: #4444ff; }
                .tag.db { background: #00ff88; color: #000; }
                .msg { flex: 1; color: #ccc; }
                .time { color: #555; }
            `}</style>
        </div>
    );
}
