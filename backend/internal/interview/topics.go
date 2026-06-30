package interview

// topics is the curated interview bank. Kept static so Start is deterministic
// and free (no LLM call) and the candidate always gets a well-scoped prompt.
var topics = []Topic{
	{
		ID:     "url_shortener",
		Title:  "URL Shortener",
		Prompt: "Design a URL shortening service (like Bit.ly). Users submit a long URL and get back a short code; visiting the short link redirects to the original. Walk me through your architecture on the canvas.",
		Constraints: []string{
			"100M new URLs / month",
			"10:1 read:write ratio",
			"10k redirects / second at peak",
			"redirects must be fast (<50ms p99)",
		},
	},
	{
		ID:     "news_feed",
		Title:  "Social News Feed",
		Prompt: "Design the news feed for a social network. Users follow others and see a ranked feed of recent posts. Build the read and write paths on the canvas.",
		Constraints: []string{
			"50M daily active users",
			"avg 200 follows / user",
			"feed loads must be <200ms p95",
			"fan-out strategy is up to you — justify it",
		},
	},
	{
		ID:     "chat",
		Title:  "Realtime Chat",
		Prompt: "Design a realtime 1:1 and group chat system (like WhatsApp). Messages must be delivered with low latency and survive server restarts. Sketch the architecture.",
		Constraints: []string{
			"5M concurrent connections",
			"messages delivered <100ms",
			"messages durable + ordered per conversation",
			"presence + delivery receipts",
		},
	},
	{
		ID:     "rate_limiter",
		Title:  "Distributed Rate Limiter",
		Prompt: "Design a distributed rate limiter that fronts a public API across many app servers. Decide the algorithm and where state lives. Build it on the canvas.",
		Constraints: []string{
			"1M requests / second across the fleet",
			"per-API-key limits, consistent across servers",
			"adds <2ms to each request",
			"degrade gracefully if the limiter store is down",
		},
	},
	{
		ID:     "video_streaming",
		Title:  "Video Streaming Platform",
		Prompt: "Design a video-on-demand streaming platform (like a small YouTube). Cover upload, transcoding, storage, and playback delivery. Lay it out on the canvas.",
		Constraints: []string{
			"1M daily viewers, 100k uploads / day",
			"adaptive bitrate playback worldwide",
			"start-up latency <2s anywhere",
			"storage + egress cost is a real concern",
		},
	},
}

// topicByID returns a topic from the bank, or false if unknown.
func topicByID(id string) (Topic, bool) {
	for _, t := range topics {
		if t.ID == id {
			return t, true
		}
	}
	return Topic{}, false
}
