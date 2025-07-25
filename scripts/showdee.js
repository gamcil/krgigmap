/**
 * Fetch event data from 쇼디락스 (Showdee Rocks)
 */

async function fetchShowdeeEvents(date) {
    const endpoint = "https://showdeerocks.com/data/"
    const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
        }
    });

    if (!response.ok) {
        console.error(`Failed for "${url}":`, response.statusText);
        return null;
    }

    const data = await response.json();

    return Object.entries(data)
        .map(([key, event]) => ({
            showdeeId: key,
            source: 'showdee',
            artists: event.artist.split(', ').map(artist => artist.trim()),
            location: event.location,
            startTime: `${event.date}T${event.time}`,
            date: event.date,
            eventUrl: event.ticket,
            entry: event.entry
        }))
        .filter(event => event.date >= date);
}

module.exports = { fetchShowdeeEvents };