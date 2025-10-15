import ConflictResolver from './ConflictResolver.js';


// Define a class for representing the timetable graph
export class TimetableGraph {
    constructor() {
        this.graph = new Map();
    }

    // Add an edge between two time slots representing a conflict
    addEdge(timeSlot1, timeSlot2) {
        if (!this.graph.has(timeSlot1)) {
            this.graph.set(timeSlot1, new Set());
        }
        if (!this.graph.has(timeSlot2)) {
            this.graph.set(timeSlot2, new Set());
        }
        this.graph.get(timeSlot1).add(timeSlot2);
        this.graph.get(timeSlot2).add(timeSlot1);
    }

    // Resolve conflicts using negotiation
    resolveConflicts() {
        // Create an instance of ConflictResolver
        const conflictResolver = new ConflictResolver();

        // Iterate over each time slot in the graph
        for (let [timeSlot, conflicts] of this.graph.entries()) {
            // Check if there are conflicts for the current time slot
            if (conflicts.size > 0) {
                // Simulate negotiation process
                console.log(`Conflict resolution for time slot ${timeSlot}:`);
                console.log(`Conflicts with time slots: ${[...conflicts].join(', ')}`);

                // Use conflictResolver to resolve conflicts
                let conflictsArray = Array.from(conflicts);
                let resolvedConflicts = conflictResolver.resolveConflicts(conflictsArray);
                console.log(`Resolved conflicts: ${JSON.stringify(resolvedConflicts)}`);
            }
        }
    }
}