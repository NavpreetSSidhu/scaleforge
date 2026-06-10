package achievements

import "time"

// Definition describes an achievement the user can earn. Definitions live in code
// (like the node catalog); only unlock state is persisted per user.
type Definition struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	// Icon is a lucide icon name the frontend renders.
	Icon string `json:"icon"`
	// Hint explains how to earn it while still locked.
	Hint string `json:"hint"`
}

// Achievement is a definition plus the requesting user's unlock state.
type Achievement struct {
	Definition
	Unlocked   bool       `json:"unlocked"`
	UnlockedAt *time.Time `json:"unlockedAt,omitempty"`
}
