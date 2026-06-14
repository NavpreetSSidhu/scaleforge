import type { Course } from '@/types/domain';
import { lld, node, py } from './helpers';

/**
 * Parking Lot — a classic object-oriented design problem. Less about a clever
 * data structure, more about clean class responsibilities and relationships:
 * ParkingLot -> Level -> ParkingSlot -> Vehicle, with a Ticket on park/unpark.
 */
export const parkingLot: Course = {
  slug: 'parking-lot',
  title: 'Parking Lot (OOD)',
  summary:
    'A classic object-oriented design: model a multi-level parking lot with sized slots, vehicles, and ticketing. Emphasis on class responsibilities.',
  difficulty: 'Intermediate',
  category: 'Object-Oriented Design',
  kind: 'lld',
  graph: {
    nodes: [
      node('lot', 'lld_class', 'ParkingLot', 320, 0, lld()),
      node('ticket', 'lld_class', 'Ticket', 60, 150, lld()),
      node('level', 'lld_class', 'Level', 320, 150, lld()),
      node('slot', 'lld_class', 'ParkingSlot', 320, 300, lld()),
      node('vehicle', 'lld_class', 'Vehicle', 560, 300, lld()),
    ],
    edges: [
      { id: 'e-lot-level', source: 'lot', target: 'level' },
      { id: 'e-lot-ticket', source: 'lot', target: 'ticket' },
      { id: 'e-level-slot', source: 'level', target: 'slot' },
      { id: 'e-slot-vehicle', source: 'slot', target: 'vehicle' },
    ],
  },
  steps: [
    {
      id: 'requirements',
      title: 'Clarify the requirements',
      body:
        'OOD questions start with **scoping**, not code. State your assumptions out loud:\n\n- The lot has **multiple levels**, each with many **slots**.\n- Slots and vehicles have **sizes** (motorcycle / car / truck); a vehicle fits a slot of equal or larger size.\n- Operations: **park** a vehicle (issue a ticket) and **unpark** by ticket/plate.\n- Out of scope for now: pricing, payments, reservations.\n\nThe top-level object is the **ParkingLot** — the façade clients talk to.',
      revealNodeIds: ['lot'],
      revealEdgeIds: [],
      focusNodeId: 'lot',
      callout: 'Scope first: levels, sized slots, park/unpark, ticketing.',
    },
    {
      id: 'level',
      title: 'Level: where the search happens',
      body:
        'A **Level** owns a list of slots and knows how to find a free one for a vehicle. Pushing the search down here keeps `ParkingLot` thin and lets levels differ (e.g. compact-only floors):' +
        py(`class Level:
    def __init__(self, number, slots):
        self.number = number
        self.slots = slots

    def find_slot(self, vehicle):
        # Smallest fitting slot, so big slots stay free for big vehicles.
        fits = [s for s in self.slots if s.fits(vehicle)]
        return min(fits, key=lambda s: s.size, default=None)`),
      revealNodeIds: ['lot', 'level'],
      revealEdgeIds: ['e-lot-level'],
      focusNodeId: 'level',
      callout: 'Best-fit: smallest slot that still fits the vehicle.',
    },
    {
      id: 'slot',
      title: 'ParkingSlot: occupancy & fit',
      body:
        'A **ParkingSlot** has an id, a size, and an optional occupant. It answers two questions and mutates its own state — each class guards its **own** invariants:' +
        py(`class ParkingSlot:
    def __init__(self, slot_id, size):
        self.slot_id, self.size = slot_id, size
        self.vehicle = None

    def is_free(self):
        return self.vehicle is None

    def fits(self, vehicle):
        return self.is_free() and self.size >= vehicle.size

    def park(self, vehicle):  self.vehicle = vehicle
    def vacate(self):         self.vehicle = None`),
      revealNodeIds: ['lot', 'level', 'slot'],
      revealEdgeIds: ['e-lot-level', 'e-level-slot'],
      focusNodeId: 'slot',
      callout: 'The slot owns its occupancy — nobody reaches in to mutate it.',
    },
    {
      id: 'vehicle',
      title: 'Vehicle & size as an enum',
      body:
        'Model **size** as an ordered enum so `fits` is a simple comparison rather than a tangle of `if` branches. `IntEnum` makes `>=` meaningful:' +
        py(`from enum import IntEnum
from dataclasses import dataclass

class VehicleSize(IntEnum):
    MOTORCYCLE = 1
    CAR = 2
    TRUCK = 3

@dataclass
class Vehicle:
    plate: str
    size: VehicleSize`) +
        'Adding a new size later is a one-line change — no scattered conditionals to hunt down.',
      revealNodeIds: ['lot', 'level', 'slot', 'vehicle'],
      revealEdgeIds: ['e-lot-level', 'e-level-slot', 'e-slot-vehicle'],
      focusNodeId: 'vehicle',
      callout: 'Ordered enum → fit checks are plain comparisons.',
    },
    {
      id: 'ticket',
      title: 'ParkingLot: park, ticket, unpark',
      body:
        'The **ParkingLot** orchestrates the levels and issues a **Ticket** on success. It tries each level in turn; a full lot returns `None`. Unpark looks up the ticket, frees the slot, and removes the record:' +
        py(`def park(self, vehicle):
    for level in self.levels:
        slot = level.find_slot(vehicle)
        if slot:
            slot.park(vehicle)
            ticket = Ticket(next(self._ids), vehicle.plate, slot.slot_id)
            self.tickets[vehicle.plate] = ticket
            return ticket
    return None  # lot full`),
      revealNodeIds: ['lot', 'level', 'slot', 'vehicle', 'ticket'],
      revealEdgeIds: ['e-lot-level', 'e-level-slot', 'e-slot-vehicle', 'e-lot-ticket'],
      focusNodeId: 'ticket',
      callout: 'ParkingLot coordinates; each class keeps a single responsibility.',
    },
    {
      id: 'recap',
      title: 'Recap & extensions',
      body:
        'Clean OOD comes from **single responsibility** and **encapsulation**: the slot owns occupancy, the level owns search, the lot owns orchestration and tickets. Sizes are an ordered enum so behaviour scales without conditionals.\n\nLikely follow-ups:\n\n- **Pricing / payments** — a `Pricing` strategy + `Ticket.issued_at`.\n- **Concurrency** — lock per level (or per slot) so two cars never claim one spot.\n- **Find-by-type counts**, EV slots, reservations.\n\nUse **Copy full solution** below for the complete, runnable model.',
      revealNodeIds: ['lot', 'level', 'slot', 'vehicle', 'ticket'],
      revealEdgeIds: ['e-lot-level', 'e-level-slot', 'e-slot-vehicle', 'e-lot-ticket'],
    },
  ],
  solution: {
    language: 'python',
    code: `from __future__ import annotations

import itertools
from enum import IntEnum
from dataclasses import dataclass


class VehicleSize(IntEnum):
    MOTORCYCLE = 1
    CAR = 2
    TRUCK = 3


@dataclass
class Vehicle:
    plate: str
    size: VehicleSize


@dataclass
class Ticket:
    id: int
    plate: str
    slot_id: str


class ParkingSlot:
    """Owns its own occupancy and fit rules."""

    def __init__(self, slot_id: str, size: VehicleSize):
        self.slot_id = slot_id
        self.size = size
        self.vehicle: Vehicle | None = None

    def is_free(self) -> bool:
        return self.vehicle is None

    def fits(self, vehicle: Vehicle) -> bool:
        return self.is_free() and self.size >= vehicle.size

    def park(self, vehicle: Vehicle) -> None:
        self.vehicle = vehicle

    def vacate(self) -> None:
        self.vehicle = None


class Level:
    """A floor of slots that knows how to find a best-fit spot."""

    def __init__(self, number: int, slots: list[ParkingSlot]):
        self.number = number
        self.slots = slots

    def find_slot(self, vehicle: Vehicle) -> ParkingSlot | None:
        fits = [s for s in self.slots if s.fits(vehicle)]
        return min(fits, key=lambda s: s.size, default=None)


class ParkingLot:
    """Top-level façade: orchestrates levels and issues tickets."""

    def __init__(self, levels: list[Level]):
        self.levels = levels
        self._ids = itertools.count(1)
        self.tickets: dict[str, Ticket] = {}

    def park(self, vehicle: Vehicle) -> Ticket | None:
        for level in self.levels:
            slot = level.find_slot(vehicle)
            if slot:
                slot.park(vehicle)
                ticket = Ticket(next(self._ids), vehicle.plate, slot.slot_id)
                self.tickets[vehicle.plate] = ticket
                return ticket
        return None  # lot full

    def unpark(self, plate: str) -> bool:
        ticket = self.tickets.pop(plate, None)
        if ticket is None:
            return False
        for level in self.levels:
            for slot in level.slots:
                if slot.slot_id == ticket.slot_id:
                    slot.vacate()
                    return True
        return False


if __name__ == "__main__":
    level = Level(1, [
        ParkingSlot("L1-M1", VehicleSize.MOTORCYCLE),
        ParkingSlot("L1-C1", VehicleSize.CAR),
        ParkingSlot("L1-T1", VehicleSize.TRUCK),
    ])
    lot = ParkingLot([level])

    car = Vehicle("ABC-123", VehicleSize.CAR)
    ticket = lot.park(car)
    assert ticket is not None and ticket.slot_id == "L1-C1"  # best fit
    assert lot.park(Vehicle("ZZ-9", VehicleSize.CAR)).slot_id == "L1-T1"
    assert lot.park(Vehicle("NO-ROOM", VehicleSize.CAR)) is None  # full
    assert lot.unpark("ABC-123") is True
    assert lot.park(Vehicle("AGAIN", VehicleSize.CAR)).slot_id == "L1-C1"
    print("ParkingLot OK")`,
  },
};
