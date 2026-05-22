import { useEffect, useState } from 'react';
import io from 'socket.io-client';
import Visualizer from './components/Visualizer';
import './App.css';

// Connect to API Server
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const socket = io(API_URL);

type SeatStatus = 'AVAILABLE' | 'BOOKED' | 'LOCKED' | 'PENDING';

interface Seat {
  id: number;
  status: SeatStatus;
}

function App() {
  const [seats, setSeats] = useState<Seat[]>(
    Array.from({ length: 100 }, (_, i) => ({ id: i + 1, status: 'AVAILABLE' }))
  );

  // Track "optimistic" booking attempts to show spinner/yellow state
  const [pendingSeats, setPendingSeats] = useState<Set<number>>(new Set());

  const [metrics, setMetrics] = useState({ booked: 0, available: 100 });
  const [telemetry, setTelemetry] = useState({
    locksAcquired: 0,
    kafkaEvents: 0,
    dbWrites: 0,
    lastActionType: 'DB' as 'LOCK' | 'KAFKA' | 'DB',
    lastActionMessage: 'System Ready'
  });

  useEffect(() => {
    // 0. Initial Data Fetch
    const fetchSeats = async () => {
      try {
        const res = await fetch(`${API_URL}/api/seats`);
        if (!res.ok) throw new Error('Failed to fetch seats');
        const data = await res.json();
        // Map DB "number" to Frontend "id"
        const mappedSeats: Seat[] = data.map((s: any) => ({
          id: s.number,
          status: s.status as SeatStatus
        }));
        setSeats(mappedSeats);
        setTelemetry(prev => ({ ...prev, lastActionMessage: "System Synchronized" }));
      } catch (err) {
        console.error("Failed to sync seats:", err);
      }
    };
    fetchSeats();

    // Listen for updates
    socket.on('seat-update', (data: { seatNumber: number; status: SeatStatus }) => {
      // console.log("Update received:", data);
      setSeats(prev => prev.map(seat => {
        if (seat.id === data.seatNumber) {
          // Remove from pending if it was pending
          if (pendingSeats.has(seat.id)) {
            const newPending = new Set(pendingSeats);
            newPending.delete(seat.id);
            setPendingSeats(newPending);
          }
          setTelemetry(prev => ({
            ...prev,
            kafkaEvents: prev.kafkaEvents + 1,
            dbWrites: prev.dbWrites + 1,
            lastActionType: 'KAFKA',
            lastActionMessage: `Confirmed: Seat ${data.seatNumber}`
          }));
          return { ...seat, status: data.status };
        }
        return seat;
      }));
    });

    return () => {
      socket.off('seat-update');
    };
  }, [pendingSeats]);

  useEffect(() => {
    const bookedCount = seats.filter(s => s.status === 'BOOKED').length;
    setMetrics({
      booked: bookedCount,
      available: 100 - bookedCount
    });
  }, [seats]);

  const handleSeatClick = async (seat: Seat) => {
    if (seat.status !== 'AVAILABLE') return;

    // 1. Optimistic UI Update (Yellow/Pending)
    setPendingSeats(prev => new Set(prev).add(seat.id));
    setSeats(prev => prev.map(s =>
      s.id === seat.id ? { ...s, status: 'PENDING' } : s
    ));

    try {
      // 2. Fire and Forget (Async Architecture)
      // We don't wait for the booking confirmation here. 
      // We wait for the Websocket event to turn it Red.
      setTelemetry(prev => ({
        ...prev,
        locksAcquired: prev.locksAcquired + 1,
        lastActionType: 'LOCK',
        lastActionMessage: `Checking Lock: Seat ${seat.id}`
      }));

      const res = await fetch(`${API_URL}/api/book-async`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: `demo_user_${Math.floor(Math.random() * 1000)}`,
          seatNumber: seat.id
        })
      });

      if (res.status === 409) {
        // Seat was actually already booked (race condition or stale state)
        // Correct the UI to show it as BOOKED
        setSeats(prev => prev.map(s =>
          s.id === seat.id ? { ...s, status: 'BOOKED' } : s
        ));
        // Remove from pending
        setPendingSeats(prev => {
          const newSet = new Set(prev);
          newSet.delete(seat.id);
          return newSet;
        });
      } else if (!res.ok) {
        // Other errors (500, etc) - Revert
        setSeats(prev => prev.map(s =>
          s.id === seat.id ? { ...s, status: 'AVAILABLE' } : s
        ));
        setPendingSeats(prev => {
          const newSet = new Set(prev);
          newSet.delete(seat.id);
          return newSet;
        });
      }

      // If 200 OK, we do nothing and wait for Socket event
      // to confirm the booking (and transition options).

    } catch (err) {
      console.error("Booking request failed", err);
      // Revert on failure (optional for this simple demo)
      setSeats(prev => prev.map(s =>
        s.id === seat.id ? { ...s, status: 'AVAILABLE' } : s
      ));
      setPendingSeats(prev => {
        const newSet = new Set(prev);
        newSet.delete(seat.id);
        return newSet;
      });
    }
  };

  return (
    <div className="container">
      <h1>TicketBlitz Live ⚡</h1>

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
        {seats.map(seat => (
          <div
            key={seat.id}
            onClick={() => handleSeatClick(seat)}
            className={`seat ${seat.status.toLowerCase()}`}
            title={`Seat ${seat.id}`}
          >
            {seat.status === 'PENDING' ? '...' : seat.id}
          </div>
        ))}
      </div>

      <Visualizer metrics={telemetry} />

      <p style={{ marginTop: '2rem', color: '#666', fontSize: '0.8rem' }}>
        Backend: Node.js + Fastify + Redis + Kafka | Frontend: React + Socket.io
      </p>
    </div>
  );
}

export default App;
