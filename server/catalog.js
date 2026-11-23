const side = 'Боковая трибуна';
const corner = 'Угловая трибуна';
const end = 'За воротами';
const stands = [side, side, side, corner, end, corner, side, side, side, corner, end, corner];
const bases = { [side]: 2400, [corner]: 1800, [end]: 1200 };
const rowPrice = (base, row) => base + (row <= 3 ? 850 : row <= 8 ? 400 : 0);
export const tickets = new Map();

function addSeat(sector, row, number, price) {
  const hash = Math.imul(sector * 4099 + row * 199 + number, 2654435761) >>> 0;
  const sold = ((hash ^ (hash >>> 11)) >>> 0) < 1360000000;
  const id = [sector, row, number].join('-');
  tickets.set(id, { id, kind: 'seat', sector, row, number, price, sold });
  return id;
}

const sectors = stands.map((title, index) => {
  const id = 101 + index;
  const rows = Array.from({ length: 9 }, (_, r) => {
    const row = r + 1;
    const price = rowPrice(bases[title], row);
    const count = title === side ? 23 : 22 + 2 * Math.floor(r / 3);
    const places = Array.from({ length: count }, (_, n) => {
      const number = n + 1;
      const bench = (id === 102 || id === 108) && row <= 2 && number >= 4 && number <= 20;
      return bench ? null : addSeat(id, row, number, price);
    });
    return { price, places };
  });
  return { id, title, rows };
});

const rooms = Array.from({ length: 8 }, (_, i) => {
  const number = i + 1;
  const id = 'vip-' + String(number).padStart(2, '0');
  const room = { id, kind: 'room', number, price: 6500, sold: false };
  tickets.set(id, room);
  return room;
});

// Old, unexpired holds keep their original descriptions and prices until release.
export function heldTicket(id) {
  const ticket = tickets.get(id);
  if (ticket) return ticket;
  const [sector, row, number] = id.split('-').map(Number);
  const base = bases[stands[sector - 101]];
  return { id, kind: 'seat', sector, row, number, price: base ? rowPrice(base, row) : 6500 };
}

export function arenaPlan(held) {
  const status = id => tickets.get(id).sold ? 2 : Number(held.has(id));
  return {
    sectors: sectors.map(({ id, title, rows }) => ({
      id, title, rows: rows.map(({ price, places }) => ({
        price, states: places.map(key => key ? status(key) : '-').join('')
      }))
    })),
    rooms: rooms.map(({ id, number, price }) => ({ id, number, price, state: status(id) }))
  };
}
