import { useEffect, useState } from 'react';
import io from 'socket.io-client';
import Visualizer from './components/Visualizer';
import AuthPanel, { type AuthUser } from './components/AuthPanel';
import './App.css';

// Connect to API Server
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const socket = io(API_URL);

const TOKEN_KEY = 'sg_token';
const USER_KEY = 'sg_user';

type SeatStatus = 'AVAILABLE' | 'BOOKED' | 'HELD' | 'PENDING';

interface Seat {
  id: number; // == DB seat "number"
  status: SeatStatus;
}

interface MyHold {
  seatNumber: number;
  heldUntil: number; // epoch ms
}

function newIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function App() {
  const [seats, setSeats] = useState<Seat[]>(
    Array.from({ length: 100 }, (_, i) => ({ id: i + 1, status: 'AVAILABLE' }))
  );

  // Auth state (persisted in localStorage)
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  });

  const handleAuth = (newToken: string, newUser: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };
  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
    setMyHold(null);
  };

  const [metrics, setMetrics] = useState({ booked: 0, available: 100 });

  // The current user's active hold (single hold at a time in this demo).
  const [myHold, setMyHold] = useState<MyHold | null>(null);
  // Ticks once a second so the countdown re-renders.
  const [now, setNow] = useState(Date.now());

  // Real stats from GET /api/stats (server-computed).
  const [stats, setStats] = useState({ booked: 0, held: 0, available: 100, conflicts: 0 });
  const [lastMessage, setLastMessage] = useState('System Ready');

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_URL}/api/stats`);
      if (!res.ok) return;
      const data: {
        seats: { total: number; booked: number; held: number; available: number };
        bookings: { total: number; conflicts: number };
      } = await res.json();
      setStats({
        booked: data.seats.booked,
        held: data.seats.held,
        available: data.seats.available,
        conflicts: data.bookings.conflicts,
      });
    } catch {
      // best-effort
    }
  };

  useEffect(() => {
    const fetchSeats = async () => {
      try {
        const res = await fetch(`${API_URL}/api/seats`);
        if (!res.ok) throw new Error('Failed to fetch seats');
        const data: Array<{ number: number; status: string; heldBy?: string | null; heldUntil?: string | null }> =
          await res.json();
        setSeats(data.map((s) => ({ id: s.number, status: s.status as SeatStatus })));
        // Restore my own active hold (e.g. after a refresh).
        const mine = data.find(
          (s) => s.status === 'HELD' && s.heldBy && user && s.heldBy === user.id && s.heldUntil && new Date(s.heldUntil).getTime() > Date.now()
        );
        if (mine && mine.heldUntil) setMyHold({ seatNumber: mine.number, heldUntil: new Date(mine.heldUntil).getTime() });
        setLastMessage('System Synchronized');
      } catch (err) {
        console.error('Failed to sync seats:', err);
      }
    };
    fetchSeats();
    fetchStats();
    const statsInterval = setInterval(fetchStats, 5000);
    return () => clearInterval(statsInterval);
  }, [user]);

  // Countdown ticker.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Clear my hold once it expires locally (the reaper will broadcast AVAILABLE).
  useEffect(() => {
    if (myHold && myHold.heldUntil <= now) {
      setMyHold(null);
      setLastMessage(`Hold on seat ${myHold.seatNumber} expired`);
    }
  }, [now, myHold]);

  useEffect(() => {
    const onSeatUpdate = (data: { seatNumber: number; status: SeatStatus; heldBy?: string }) => {
      setSeats((prev) =>
        prev.map((seat) => (seat.id === data.seatNumber ? { ...seat, status: data.status } : seat))
      );
      // Keep my-hold state in sync with broadcasts.
      if (data.status === 'BOOKED' || data.status === 'AVAILABLE') {
        setMyHold((h) => (h && h.seatNumber === data.seatNumber ? null : h));
      }
      if (data.status === 'HELD') setLastMessage(`Seat ${data.seatNumber} held`);
      if (data.status === 'BOOKED') setLastMessage(`Seat ${data.seatNumber} booked`);
      fetchStats();
    };
    socket.on('seat-update', onSeatUpdate);
    return () => {
      socket.off('seat-update', onSeatUpdate);
    };
  }, []);

  useEffect(() => {
    const booked = seats.filter((s) => s.status === 'BOOKED').length;
    const held = seats.filter((s) => s.status === 'HELD').length;
    setMetrics({ booked, available: seats.length - booked - held });
  }, [seats]);

  const setSeatStatus = (seatNumber: number, status: SeatStatus) =>
    setSeats((prev) => prev.map((s) => (s.id === seatNumber ? { ...s, status } : s)));

  const placeHold = async (seat: Seat) => {
    if (!token) {
      setLastMessage('Please log in to book a seat');
      return;
    }
    setSeatStatus(seat.id, 'PENDING');
    setLastMessage(`Holding seat ${seat.id}…`);
    try {
      const res = await fetch(`${API_URL}/api/holds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ seatNumber: seat.id }),
      });
      if (res.status === 401) {
        handleLogout();
        setSeatStatus(seat.id, 'AVAILABLE');
        setLastMessage('Session expired — please log in again');
        return;
      }
      if (res.ok) {
        const data: { seatNumber: number; heldUntil: string } = await res.json();
        setSeatStatus(seat.id, 'HELD');
        setMyHold({ seatNumber: seat.id, heldUntil: new Date(data.heldUntil).getTime() });
        setLastMessage(`Held seat ${seat.id} — confirm before it expires`);
      } else {
        // 409 (someone else holds/booked it) or other — resync.
        setSeatStatus(seat.id, 'HELD');
        setLastMessage(`Seat ${seat.id} is no longer available`);
        fetchStats();
      }
    } catch (err) {
      console.error('Hold request failed', err);
      setSeatStatus(seat.id, 'AVAILABLE');
      setLastMessage(`Hold request failed for seat ${seat.id}`);
    }
  };

  const confirmHold = async () => {
    if (!token || !myHold) return;
    const seatNumber = myHold.seatNumber;
    setLastMessage(`Confirming seat ${seatNumber}…`);
    try {
      const res = await fetch(`${API_URL}/api/holds/${seatNumber}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ idempotencyKey: newIdempotencyKey() }),
      });
      if (res.status === 401) {
        handleLogout();
        setLastMessage('Session expired — please log in again');
        return;
      }
      if (res.ok) {
        setSeatStatus(seatNumber, 'BOOKED');
        setMyHold(null);
        setLastMessage(`Booked seat ${seatNumber} ✅`);
        fetchStats();
      } else {
        // 409 — hold expired before confirm.
        setMyHold(null);
        setLastMessage(`Hold on seat ${seatNumber} expired before confirm`);
        fetchStats();
      }
    } catch (err) {
      console.error('Confirm failed', err);
      setLastMessage(`Confirm failed for seat ${seatNumber}`);
    }
  };

  const handleSeatClick = (seat: Seat) => {
    if (seat.status === 'AVAILABLE') {
      placeHold(seat);
    } else if (seat.status === 'HELD' && myHold?.seatNumber === seat.id) {
      confirmHold();
    }
  };

  const remainingSecs = myHold ? Math.max(0, Math.ceil((myHold.heldUntil - now) / 1000)) : 0;

  return (
    <div className="container">
      <h1>TicketBlitz Live ⚡</h1>

      <AuthPanel apiUrl={API_URL} user={user} onAuth={handleAuth} onLogout={handleLogout} />
      {!user && (
        <p style={{ color: '#888', fontSize: '0.8rem', marginTop: '-0.5rem' }}>
          Log in or create an account to hold and book seats.
        </p>
      )}

      {myHold && (
        <div className="hold-banner">
          <span className="hold-text">
            You’re holding <strong>seat {myHold.seatNumber}</strong> —{' '}
            <span className="countdown">{remainingSecs}s</span> left
          </span>
          <button onClick={confirmHold}>Confirm booking</button>
        </div>
      )}

      <div className="metrics">
        <div className="card">
          <h3>Available</h3>
          <span className="green">{metrics.available}</span>
        </div>
        <div className="card">
          <h3>Sold Out</h3>
          <span className="red">{metrics.booked}</span>
        </div>
      </div>

      <div className="grid">
        {seats.map((seat) => {
          const mine = seat.status === 'HELD' && myHold?.seatNumber === seat.id;
          return (
            <div
              key={seat.id}
              onClick={() => handleSeatClick(seat)}
              className={`seat ${seat.status.toLowerCase()}${mine ? ' mine' : ''}`}
              title={`Seat ${seat.id}`}
            >
              {seat.status === 'PENDING' ? '...' : mine ? `${remainingSecs}s` : seat.id}
            </div>
          );
        })}
      </div>

      <Visualizer stats={{ ...stats, lastMessage }} />

      <p style={{ marginTop: '2rem', color: '#666', fontSize: '0.8rem' }}>
        Backend: Node.js + Fastify + Prisma + PostgreSQL | Real-time: Socket.io | Frontend: React + Vite
      </p>
    </div>
  );
}

export default App;
