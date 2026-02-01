/**
 * Fetch event data from 쇼디락스 (Showdee Rocks)
 */


// DEPRECATED: old JSON endpoint no longer updated
async function fetchShowdeeEventsOld(date) {
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

async function fetchShowdeeEvents(limit = 50, cursor = null) {
    const endpoint = `https://showdeerocks.com/api/v1/performances?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`;
    const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
        }
    });
    if (!response.ok) {
        console.error(`Failed for "${endpoint}":`, response.statusText);
        return null;
    }
    const data = await response.json();
    const events = data.items.map(event => ({
        showdeeId: event.id,
        source: 'showdee',
        artists: event.bands.map(artist => artist.name),
        location: event.location.name,
        date: event.startTime.split('T')[0],
        startTime: event.startTime,
        eventUrl: event.ticket.link,
        entry: event.ticket.entryType,
        imgSrc: event.imageSrc
    }));
    return { events: events, nextCursor: data.nextCursor };
}

async function fetchAllShowdeeEvents(batches = 10, limit = 50) {
    let allEvents = [];
    let cursor = null;
    for (let i = 0; i < batches; i++) {
        console.log(`Batch ${i + 1}/${batches}`);
        const result = await fetchShowdeeEvents(limit, cursor);
        if (!result) break;
        allEvents = allEvents.concat(result.events);
        cursor = result.nextCursor;
        if (!cursor) break;
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    return allEvents;
}

module.exports = { fetchShowdeeEvents, fetchAllShowdeeEvents };